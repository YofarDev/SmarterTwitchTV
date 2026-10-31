/* Player feed reopened from the player (Up, or the bar's Channels) starts on the live list again. Closing it only
 * hides its holder, so the list it was on must be hidden on the way back, and with a game's list also its
 * "go back to games" hint. Loads the real UserLiveFeedobj.js and UserLiveFeed.js. */
const assert = require('assert');
const fs = require('fs');
const vm = require('vm');

const s = {};
vm.createContext(s);
vm.runInContext(fs.readFileSync('app/specific/UserLiveFeedobj.js', 'utf8'), s);
vm.runInContext(fs.readFileSync('app/specific/UserLiveFeed.js', 'utf8'), s);

let checks = 0;
function check(value, message) {
    assert.ok(value, message);
    checks++;
}

const hidden = [];
let classes = {},
    userSet = true;
Object.assign(s, {
    AddUser_UserIsSet: () => userSet,
    Main_AddClass: (id, name) => (classes[id] = name)
});
for (let pos = 0; pos <= s.UserLiveFeedobj_MAX; pos++) s.UserLiveFeed_obj[pos] = {hide: () => hidden.push(pos)};

function reopenFrom(pos, user) {
    userSet = user;
    hidden.length = 0;
    classes = {};
    s.UserLiveFeed_FeedPosX = pos;
    s.UserLiveFeed_ResetFeedPosX();
}

for (const game of ['UserLiveFeedobj_UserAGamesPos', 'UserLiveFeedobj_AGamesPos']) {
    reopenFrom(s[game], true);
    check(hidden.join() === String(s[game]), game + ': the game list is hidden');
    check(classes.icon_feed_back === 'opacity_zero', game + ': its go back hint is hidden');
    check(s.UserLiveFeed_FeedPosX === s.UserLiveFeedobj_UserLivePos, game + ': the feed reopens on followed live');
}

reopenFrom(s.UserLiveFeedobj_UserVodPos, true);
check(hidden.join() === String(s.UserLiveFeedobj_UserVodPos), 'followed VODs: the list is hidden before followed live shows');

reopenFrom(s.UserLiveFeedobj_UserLivePos, true);
check(!hidden.length && !classes.icon_feed_back, 'already on followed live: nothing to hide');

reopenFrom(s.UserLiveFeedobj_FeaturedPos, false);
check(hidden.join() === String(s.UserLiveFeedobj_FeaturedPos), 'no account: the featured list is hidden');
check(s.UserLiveFeed_FeedPosX === s.UserLiveFeedobj_LivePos, 'no account: the feed reopens on live');

console.log(checks + ' player feed checks passed');
