# Phone chat mute and repeat-filter validation — October 31, 2026

## Findings and changes

The connected Fire TV (AFTKRT) ran debug APK 394. Its packaged and HTTP-served
phone assets matched the repository byte for byte. Updating the TV web app alone
does not update those assets.

Mute depended on a hidden long-press gesture; the muted-list button was also
hidden until the first mute. Usernames now provide a native button that opens
the same mute sheet by tap or keyboard. The muted-list button stays visible and
its empty state explains both gestures. Long-press and desktop context-menu
support remain available.

The repeat filter was always enabled, but any other user's message interrupted
it. It now keeps a bounded merge target per user for fifteen seconds. Different
text, action type, badge classification, expired windows and older timestamps
keep separate rows. Moderator deletion of a merged message now also removes the
displayed group; deleted or removed rows cannot absorb later messages.

## Verification

- Full release maker and JSHint passed; generated output was regenerated.
- Phone fixtures: **488 source checks and 488 generated-bundle checks passed**.
- TV collector: **11 checks passed**.
- TV scheduler/cache: **807 checks passed**.
- Native phone/debug server: **37 checks passed**.
- Update checks: **20 passed**; generated badge/cache/playback checks: **94 passed**.
- Real source and generated phone pages passed Chrome browser checks. The
  generated bundle also passed in **Chrome on an Android 14 emulator**. These
  covered tap/keyboard mute, long-press and scrolling, unmute, persistence,
  priority-tab filtering, interleaved repeats, grouped-message deletion and
  narrow layout, with no page errors. Twitch responses and IRC were mocked;
  no real account authorization or messages were sent.
- Debug APK **3.0.395** built with JDK 17 and installed on the connected Fire TV.
  Existing playback resumed. All three packaged phone assets match the generated
  output, and the TV's HTTP-served JS and CSS match it byte for byte.
- TV logs checked before and after installation contained no uncaught TypeError,
  ReferenceError or fatal exception.

The user's physical Android browser was not remotely accessible. The original
gesture failure was not reproduced there; the explicit tap action removes the
need to rely on that gesture. Open **Chat on phone** and scan the TV QR again
after installation because the server restart creates a new pairing.

Repeat filtering groups identical messages from the same user; it is not a
general spam classifier. Muting remains local to the phone/browser.

Browser checks are reproducible using `release/scripts/phonechat-browser-tests.js`;
see the optional commands in `phone-chat-setup.md`.
