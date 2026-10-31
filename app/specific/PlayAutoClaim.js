/*
 * Copyright (c) 2017–present Felipe de Leon <fglfgl27@gmail.com>
 *
 * This file is part of SmartTwitchTV <https://github.com/fgl27/SmartTwitchTV>
 *
 * SmartTwitchTV is free software: you can redistribute it and/or modify
 * it under the terms of the GNU General Public License as published by
 * the Free Software Foundation, either version 3 of the License, or
 * (at your option) any later version.
 *
 * SmartTwitchTV is distributed in the hope that it will be useful,
 * but WITHOUT ANY WARRANTY; without even the implied warranty of
 * MERCHANTABILITY or FITNESS FOR A PARTICULAR PURPOSE. See the
 * GNU General Public License for more details.
 *
 * You should have received a copy of the GNU General Public License
 * along with SmartTwitchTV. If not, see <https://github.com/fgl27/SmartTwitchTV/blob/master/LICENSE>.
 *
 */

//Auto claim of bonus channel points and drops while a live stream plays, driven by the PlayChannelPoints minute tick.
//Based on BetterTTV's Auto Claim settings (Bonus Channel Points, Drops). The drops inventory query, claim mutation and
//eligibility rules are adapted from BetterTTV src/modules/auto_claim/index.js <https://github.com/night/betterttv>,
//Copyright (c) 2023 NightDev, LLC, MIT License <https://github.com/night/betterttv/blob/master/LICENSE>.
//Uses Twitch's undocumented GraphQL API, which may change without notice; any failure here is silent and only skips a claim.
var PlayAutoClaim_Generation = 0;
var PlayAutoClaim_Ticks = 0;
//Drops take minutes to hours, check them less often than the channel bonus
var PlayAutoClaim_DropsEvery = 5;
var PlayAutoClaim_DropNames = {};
var PlayAutoClaim_DropKey = 0;
//Some Android versions replace a showing toast with the next one, so notices close together share one toast
var PlayAutoClaim_Notices = [];
var PlayAutoClaim_NoticeId = null;
var PlayAutoClaim_NoticeShownAt = 0;
//Wait for the other claims of the same tick
var PlayAutoClaim_NoticeWaitMs = 1000;
//Toast.LENGTH_LONG
var PlayAutoClaim_ToastMs = 3500;

var PlayAutoClaim_InventoryQuery =
    'query Inventory { currentUser { id inventory { dropCampaignsInProgress { id timeBasedDrops { id name requiredMinutesWatched ' +
    'self { isClaimed currentMinutesWatched dropInstanceID hasPreconditionsMet } } } } } }';
var PlayAutoClaim_ClaimDropMutation = 'mutation ClaimDrop($input: ClaimDropRewardsInput!) { claimDropRewards(input: $input) { status } }';

function PlayAutoClaim_Reset() {
    PlayAutoClaim_Generation++;
    PlayAutoClaim_Ticks = 0;
    PlayAutoClaim_DropNames = {};
}

//Called once per minute of live playback (paused, buffering and background minutes are skipped)
function PlayAutoClaim_Tick(channelId) {
    if (Settings_Obj_default('auto_claim_bonus')) PlayAutoClaim_BonusCheck(channelId);
    if (Settings_Obj_default('auto_claim_drops') && PlayAutoClaim_Ticks % PlayAutoClaim_DropsEvery === 0) PlayAutoClaim_DropsCheck();

    PlayAutoClaim_Ticks++;
}

function PlayAutoClaim_Gql(body, callback, key) {
    FullxmlHttpGet(PlayClip_BaseUrl, Main_OAuth_User_Headers, callback, noop_fun, key, PlayAutoClaim_Generation, 'POST', JSON.stringify(body));
}

function PlayAutoClaim_Data(obj, id) {
    if (id !== PlayAutoClaim_Generation || obj.status !== 200) return null;

    try {
        return JSON.parse(obj.responseText).data;
    } catch (e) {
        return null;
    }
}

//settingKey = the notice toggle of that claim type
function PlayAutoClaim_Notify(settingKey, text) {
    if (!Settings_Obj_default(settingKey)) return;

    PlayAutoClaim_Notices.push(text);

    if (PlayAutoClaim_NoticeId !== null) return;

    //After the wait, and never over a toast still on screen
    PlayAutoClaim_NoticeId = Main_setTimeout(
        PlayAutoClaim_NotifyShow,
        Math.max(PlayAutoClaim_NoticeWaitMs, PlayAutoClaim_NoticeShownAt + PlayAutoClaim_ToastMs - new Date().getTime())
    );
}

function PlayAutoClaim_NotifyShow() {
    PlayAutoClaim_NoticeId = null;

    if (!PlayAutoClaim_Notices.length) return;

    //One line per claim
    OSInterface_showToast(PlayAutoClaim_Notices.join('\n'));
    PlayAutoClaim_Notices = [];
    PlayAutoClaim_NoticeShownAt = new Date().getTime();
}

function PlayAutoClaim_BonusCheck(channelId) {
    PlayAutoClaim_Gql(
        {query: 'query { user(id: "' + channelId + '") { id channel { self { communityPoints { balance availableClaim { id } } } } } }'},
        PlayAutoClaim_BonusCheckSuccess,
        0
    );
}

function PlayAutoClaim_BonusCheckSuccess(obj, key, id) {
    var data = PlayAutoClaim_Data(obj, id),
        user = data && data.user,
        points = user && user.channel && user.channel.self && user.channel.self.communityPoints;

    //Only claim on the channel still being watched
    if (!points || !points.availableClaim || !Main_A_equals_B(user.id, PlayChannelPoints_ChannelId)) return;

    PlayAutoClaim_Gql(
        {
            query:
                'mutation { claimCommunityPoints(input: {channelID: "' +
                user.id +
                '", claimID: "' +
                points.availableClaim.id +
                '"}) { currentPoints error { code } } }'
        },
        PlayAutoClaim_BonusClaimSuccess,
        points.balance || 0
    );
}

//key = balance before the claim
function PlayAutoClaim_BonusClaimSuccess(obj, key, id) {
    var data = PlayAutoClaim_Data(obj, id),
        result = data && data.claimCommunityPoints;

    if (!result || result.error || !result.currentPoints) return;

    var earned = result.currentPoints - (key || 0);

    PlayAutoClaim_Notify('auto_claim_notify_bonus', earned > 0 ? STR_POINTS_BONUS_CLAIMED.replace('%x', earned) : STR_POINTS_BONUS_CLAIMED_NO_COUNT);
}

function PlayAutoClaim_DropsCheck() {
    PlayAutoClaim_Gql({query: PlayAutoClaim_InventoryQuery}, PlayAutoClaim_DropsCheckSuccess, 0);
}

function PlayAutoClaim_DropsCheckSuccess(obj, key, id) {
    var data = PlayAutoClaim_Data(obj, id),
        user = data && data.currentUser,
        campaigns = user && user.inventory && user.inventory.dropCampaignsInProgress;

    if (!campaigns) return;

    var i = 0,
        j,
        len = campaigns.length,
        drops,
        drop;

    for (i; i < len; i++) {
        drops = campaigns[i].timeBasedDrops || [];

        for (j = 0; j < drops.length; j++) {
            drop = drops[j];

            if (
                !drop.self ||
                drop.self.isClaimed ||
                drop.self.currentMinutesWatched < drop.requiredMinutesWatched ||
                !drop.self.hasPreconditionsMet
            ) {
                continue;
            }

            PlayAutoClaim_DropKey++;
            PlayAutoClaim_DropNames[PlayAutoClaim_DropKey] = drop.name;

            PlayAutoClaim_Gql(
                {
                    query: PlayAutoClaim_ClaimDropMutation,
                    variables: {input: {dropInstanceID: drop.self.dropInstanceID || user.id + '#' + campaigns[i].id + '#' + drop.id}}
                },
                PlayAutoClaim_DropClaimSuccess,
                PlayAutoClaim_DropKey
            );
        }
    }
}

//key = PlayAutoClaim_DropNames key of the claimed drop
function PlayAutoClaim_DropClaimSuccess(obj, key, id) {
    var data = PlayAutoClaim_Data(obj, id),
        name = PlayAutoClaim_DropNames[key];

    delete PlayAutoClaim_DropNames[key];

    //Claimed: ELIGIBLE_FOR_ALL (seen on device) or ELIGIBLE_FOR_SOME, anything else is a refusal
    if (!data || !data.claimDropRewards || (data.claimDropRewards.status + '').indexOf('ELIGIBLE_FOR_') !== 0) return;

    PlayAutoClaim_Notify('auto_claim_notify_drops', STR_POINTS_DROP_CLAIMED.replace('%x', name || ''));
}
