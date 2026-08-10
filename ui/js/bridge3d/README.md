# The room, and how to look at it without a headset

`ui/bridge3d.html` is the board as a world you stand inside. This file is how you
*run* it. What is **correct** — the arc a target has to cover, how far a thing
stands, what earns being an object rather than a panel, what to build it with —
lives in one place and it is not here: the **`vr-design` skill**, plus its
`world.md`, `building.md`, `testing.md` and `rendering.md`. Read that before
placing or sizing anything. Every number in this directory was derived from it,
and a second copy of those numbers is a copy that goes stale.

The division that matters: **the loop proves the room looks right and measures
right; the person wearing it says whether it feels right.** No screenshot and no
test detects fatigue, presence or scale. Headset time is not optional.

One thing the loop is unusually good at, and it earned its keep twice: **measure
contrast on the RENDERED FRAME, not on the palette constants.** Tone mapping
sits between the two, and a background that changes as he turns his head cannot
be reasoned about from a hex value at all — that is how bare crew labels shipped
at 1.29:1 against a 4.5:1 floor while every constant in `kit.js` looked fine.

## One command

```bash
node dev/room-shots.js
```

Starts the frontend playground, drives a headless Chrome at the room, enters a
real immersive session through an emulated headset, opens the surfaces that do
not exist until somebody asks for them (the board, a chat, a card), poses the
head at each named viewpoint and writes:

```
dev/shots/<viewpoint>.png     one per viewpoint in viewpoints.js
dev/shots/manifest.json       yaw, pitch, why the shot exists, frame and draw statistics
```

Then it **points at things**. A photograph proves the room did not go blank; it
says nothing about whether the ray reaches anything, and the ways that break are
all invisible in a PNG. So the run aims the head at one of each kind of thing —
a lieutenant, the mat that opens the board — and fails if any of them does not
light up.

Then it **works the wall**, which is where the three things a photograph cannot
show live: how many titles are on it with nothing filtered, that pressing a
lieutenant's face filters it with no typing, and that scrolling a lane to the
bottom of its column changes the uikit node count by **exactly zero**. The last
one is the reason the wall is built out of a fixed row pool at all — the surface
that held one live node per card is the one that killed the headset browser at
about sixty rows, and the wall holds seventy-eight. It writes `wall-scrolled.png`
and `wall-filtered.png` beside the viewpoints, and the numbers into the manifest.

Frame time is in there too, as a RATIO: the same room with the wall shut and
with it open, on whatever renderer this machine has. An absolute millisecond
figure off a software rasteriser means nothing against a 13.9 ms headset budget;
the ratio and the draw-call count travel.

And it **grabs a window**: opens a chat, aims at its title bar, squeezes, turns
its head, releases, and checks the panel came along. Moving a window is the one
interaction he named as a requirement rather than a nicety, and it is invisible
in every screenshot — a panel that never budges looks exactly like a panel
nobody has tried to move.

No display, no headset, no `npm install` — Node built-ins and whatever Chrome is
on the machine. It exits non-zero if a frame came back blank or the ray landed on
nothing.

```
--out DIR      somewhere else to write (default dev/shots/)
--size WxH     browser window, and so the shape of the frame (default 1280x960)
--url URL      photograph a real server instead of the fixture playground,
               e.g. --url https://bc.pensamais.com.br
--keep         leave the throwaway Chrome profile behind, for poking at
CHROME=/path   which browser to drive, if it is not google-chrome on PATH
```

The fixture board is small — ten cards, four lieutenants. Point `--url` at the
real board to photograph the room at real density, which is the only place a
full crew, a long card body and a filter with something to filter show up.

## The flags

Both are off unless the URL turns them on, and off means *not fetched* — a test
in `test/bridge3d.test.js` fails if the emulator ever creeps into a top-level
import.

| | |
|---|---|
| `?capture=1` | `preserveDrawingBuffer: true` on the renderer. Without it a screenshot of the canvas comes back empty, because the buffer is gone by the time anything asks for it. It costs frame time, which is why it is a flag. |
| `?xr=emulate` | Loads `devxr.js`, which installs [IWER](https://github.com/meta-quest/immersive-web-emulation-runtime) over `navigator.xr`. `requestSession('immersive-vr')` then returns a **genuine** session — the same WebXRManager path, reference space and input sources three.js takes in a real headset. That is the half that only ever broke in the headset. |

## Standing in it yourself

Open **`/ui/bridge3d.html?capture=1&xr=emulate`** in any desktop browser and
press *enter the bridge*. You are in an immersive session with an emulated Quest
3, one right-hand controller, and:

- **drag** — turn the head
- **arrow keys** — walk
- **click** — pulls the trigger. The ray rides the head, so what a click lands on
  is whatever is under the dot in the middle of the view; a plain mouse click
  reaches nobody inside a session, which is why it is wired to `selectstart`
- **b** — the board · **c** — a chat · **x** — close the front window

The emulated hand is held below and to the right of the head and aimed at a
point 1.75 m out by default — `__xr.reach(m)` moves it — so it reproduces some
of the scatter a real hand has instead of firing a ray from the exact centre of
the eye. That is what
the 6° colliders exist for, and a ray that started at the eye would never test
them.

From a console, `window.__xr` gives you `look('board')`, `aim(yaw, pitch)`,
`reach(m)` — how far out the hand and the gaze converge, which matters because a
hand converging at 1.75 m sails past a panel standing at 1.10 m —
`press('trigger')`, `frames(n)`, `frameStats()` and the live `device`.
`window.__bridge` gives you the room — `openBoard()`, `openChat(id)`,
`openCard(id)`, `panels()` for where each one is standing, `lit()` for whatever
the ray is currently on, `stats()` for draw calls, roots and target count, and
the `agents` / `windows` / `grabs` / `sound` themselves.

The `?capture=1` is only needed if you intend to screenshot; the emulated session
works on its own.

IWER also ships a full emulator panel (`@iwer/devui`, sliders for every joint).
It is 850 KB — four times the runtime — for controls a mouse already gives, so
it is deliberately not vendored. Add it if hand-driving ever stops being enough.

## The viewpoints

`viewpoints.js` — a place to stand and a thing to look at, never a raw
quaternion, and every target read out of `world.js` so a thing that moves drags
its photograph along with it. Add one and it is photographed and measured on the
next run. The same file carries `PROBES`, which is the list of things the ray has
to be able to land on.

## What a photograph is not

Screenshots catch *it went blank*. They never catch *that target is 5.7°*, and
exact-pixel comparison across drivers is flaky enough to train you to ignore it.
So the only image assertion the capture script makes is structural — colour count
and lit fraction, enough to fail an empty room.

Everything else is measured in **`test/bridge3d.test.js`**, in true arc: the room
is built for real, the four corners of every responsive region are put into world
coordinates, and the angle is re-derived as `acos` of a dot product — a different
formula from the `atan` construction under test. Gaps are measured between the
two regions' whole outlines rather than between their bounding boxes, because a
rectangle lying on a plane tilted away from the eye is a keystone in the eye's
own angles and comparing its bottom corner against its neighbour's top corner
measures the distance between two points that are nowhere near each other. It
runs in the ordinary suite:

```bash
node --test test/*.test.js harness/test/*.test.js
```

## The real headset

The Quest browser accepts remote debugging, and it is the only way to see the
bugs that only exist in hardware:

1. On the headset: *Settings → System → Developer → USB Debugging* on, plug it
   in (or `adb connect <quest-ip>:5555` over Wi-Fi).
2. `adb devices` to confirm, then open `chrome://inspect#devices` on the
   desktop, or forward the port yourself:
   `adb forward tcp:9222 localabstract:chrome_devtools_remote`.
3. Open the room in the Quest browser, then **inspect** it from the desktop —
   console, network, and a live view of what is being worn.

Everything in `window.__xr` is absent there, because there is nothing to
emulate; `window.__bridge` is not, so the room can still be driven by hand.

## The files

| | |
|---|---|
| `world.js` | where everything stands and what standing there means — pure, no three.js, no DOM. Every angular figure in the room comes from here |
| `main.js` | the room: renderer, session, the loop, the desk fallback, and what each thing does when it is pressed |
| `sky.js` | the daylight sky, drawn into a canvas and run through PMREM so it becomes the light everything else is lit by. The sun, and the tone mapping |
| `place.js` | the terrace: deck, parapet, handrail, planters, skyline, sea — the bound you can see |
| `agents.js` | the eight fixed berths and the lieutenants in them |
| `panel.js` | a surface with prose on it he can read, move and put down — the bar is the handle, the body scrolls, the foot holds a composer |
| `chat.js` | a conversation on a panel: the thread, and a composer that really sends |
| `board.js` | the wall — six flat tiles on a 120° arc carrying 78 rows out of one fixed pool, the rail of faces that filters it by pressing, and the card a row opens |
| `windows.js` | how many panels are open, where they land, and the rule that the room never moves one he has placed |
| `grab.js` | squeeze to pick a window up, and what happens when he lets go |
| `sound.js` | the music bed, and the sound a press, a grab and a release make |
| `voice3d.js` | the crew, out loud — `../voice.js`'s speech, arriving from the berth the lieutenant is standing in |
| `list.js` | the mat on the floor that opens the board |
| `hover.js` | the ray, and the six states a thing goes through when it is pointed at |
| `kit.js` | uikit wired in once: layout, MSDF text, the palette |
| `type.js` | the glyph filter — what the font can actually draw, and what to do about the rest. No imports, so a test can load it |
| `md3d.js` | a markdown body as things in the room: marked's lexer in, uikit nodes out, no HTML anywhere near it |
| `viewpoints.js` | the places the room is photographed from, and the things the ray must reach — pure |
| `devxr.js` | the emulated headset, behind `?xr=emulate` |
| `../../vendor/` | three, uikit, pointer-events, marked, IWER — vendored unmodified except the font atlas, see `ui/vendor/README.md` |
| `../../../dev/room-shots.js` | the capture script |
