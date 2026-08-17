# Interactive Flow Chart

A lightweight static web app for navigating structured flow charts in two ways:

- **Sequence:** step through decisions, actions, groups, and loops with text prompts.
- **Sequence:** completed steps and groups remain visible and fade into the timeline; when a top-level element completes, the next active top-level element scrolls to the top.
- **Flow Chart:** view the full top-to-bottom decision tree or a linked chart image, pan like a map, and zoom to inspect details.

The app uses only plain HTML, CSS, and JavaScript. There is no build step and no external library dependency.

## Architecture

```text
.
|-- index.html          # App shell and interface markup
|-- styles.css          # Responsive visual design
|-- app.js              # Flow loading, validation, sequence logic, chart rendering
|-- flows/
|   |-- manifest.json   # Bundled flow registry and default flow
|   |-- bundled-flows.js # Direct-file fallback registry for browsers that block local JSON fetches
|   `-- default.json    # Generic sample flow
`-- AGENTS.md           # Project instructions
```

## Flow Data

Flow definitions live as JSON files in `flows/`. The app reads `flows/manifest.json` and loads the default flow directly. There is no in-page flow selector.

For more than one flow, keep this page direct and create a separate index page or static document with links such as `index.html?flow=72h_insulinoma_fast`. That preserves a clean single-flow interface while still allowing a hub/index to route users to separate flows. This project currently needs only one visible flow, so no index page is included.

Each flow has:

- `id`: stable flow id
- `title`: display name
- `description`: short summary
- `tooltip`: optional hover/focus helper text for the flow description
- `links`: optional list of supporting links for the flow description
- `chartImage` / `chartImages`: optional image replacement for the generated Flow Chart view
- `startId`: first node id
- `nodes`: object keyed by node id

Supported node types:

- `decision`: asks a question and routes through `yes`/`no` or a custom `answers` list
- `action`: describes work to perform and continues through `next`
- `end`: terminal outcome
- `group`: contains its own linear `nodes`, starts at `startId`, and completes or repeats based on `condition`
- `loop`: contains its own linear `nodes`, starts at `startId`, and repeats until its `condition` completes

Each node may also include:

- `displayType`: optional label shown in the UI instead of the internal `type`, such as `Decision`, `Choice`, `Lab`, `Task`, or `Outcome`
- `navigationTitle`: optional label shown in the Sequence navigation menu instead of `title`
- `tooltip`: optional hover/focus helper text
- `links`: optional list of related resources
- `actions`: optional list of next-step details shown in Sequence mode and the chart detail panel
- `display`: optional display behavior for Sequence content reveal controls
- `critical`: optional boolean; highlights the full element with a slight red background and red border

## Decision Answers

Simple yes/no decisions can still use `yes` and `no`:

```json
{
  "type": "decision",
  "question": "Is the result stable?",
  "yes": "$complete",
  "no": "$repeat"
}
```

For more than two answers, use `answers`:

```json
{
  "type": "decision",
  "title": "Review grouped result",
  "question": "What is the review outcome?",
  "answers": [
    {
      "id": "accept",
      "label": "Meets criteria",
      "description": "Complete this group and continue.",
      "target": "$complete",
      "size": "large",
      "variant": "primary"
    },
    {
      "id": "revise",
      "label": "Needs revision",
      "description": "Repeat the group before continuing.",
      "target": "$repeat",
      "size": "large"
    },
    {
      "id": "exception",
      "label": "Requires exception review",
      "description": "Repeat after documenting the exception.",
      "target": "$repeat",
      "size": "large"
    }
  ]
}
```

Answer fields:

- `id`: stable answer value used by conditions
- `label`: button text
- `description`: optional supporting text displayed inside the answer box
- `target` or `next`: destination node id or control outcome such as `$complete` / `$repeat`
- `size`: optional; use `large` for bigger answer boxes
- `variant`: optional visual emphasis; use `primary` for the preferred path

## Flow Chart Images

By default, Flow Chart mode renders the JSON nodes as a generated top-to-bottom tree. To use an image instead, add `chartImage` or `chartImages` at the top level of the flow JSON. Image mode uses the full page width without the Flow Chart detail side panel, while keeping the same viewport, zoom controls, fit button, and hold-to-drag panning behavior.

For chart images, Fit sets the minimum zoom to the scale required to keep the entire image in view, even for very large images. Transparent PNG/SVG images remain transparent so the viewer grid stays visible behind the image.

Single image:

```json
{
  "chartImage": {
    "label": "Clinical pathway",
    "src": "flows/images/insulinoma-fast.png",
    "alt": "72-hour supervised fast flow chart",
    "description": "Image version of the flow chart.",
    "links": [
      {
        "label": "Source diagram",
        "url": "flows/72h_insulinoma_fast-linear.drawio"
      }
    ]
  }
}
```

Multiple images:

```json
{
  "chartImages": [
    {
      "label": "Overview",
      "src": "flows/images/overview.png"
    },
    {
      "label": "Detailed lab pathway",
      "src": "flows/images/labs.png"
    }
  ]
}
```

Multiple image versions can be grouped. The Flow Chart toolbar shows an image selector when more than one image/version is available. The grouped image `label` is used as the selector caption, while each child image/version `label` is used as the option text:

```json
{
  "chartImages": [
    {
      "label": "Clinician diagram",
      "versions": [
        {
          "label": "v1",
          "src": "flows/images/clinician-v1.png"
        },
        {
          "label": "v2",
          "src": "flows/images/clinician-v2.png"
        }
      ]
    },
    {
      "label": "Patient handout",
      "images": [
        {
          "label": "English",
          "src": "flows/images/patient-en.png"
        },
        {
          "label": "Spanish",
          "src": "flows/images/patient-es.png"
        }
      ]
    }
  ]
}
```

Supported image fields:

- `src`, `url`, `href`, `path`, or `file`: image path or URL
- `label`, `title`, or `name`: image option/accessibility label; it is not rendered inside the image viewer
- grouped `label`: selector caption for grouped `images` or `versions`
- `alt`: image alt text
- `description` / `details`: text shown in the Flow Chart detail panel
- `links`: optional resources shown in the detail panel
- `actions`: optional detail-panel action list

## Sequence Content Display

By default, Sequence mode shows all node questions, details, actions, links, and answer controls immediately. This keeps dense active groups fully visible in their most expanded state.

If a specific node should start with its details/actions/links hidden, add `display.hideOnStart`. The reveal behavior can be `click` or `hover`; if omitted, it defaults to `click`.

```json
{
  "type": "action",
  "title": "Review optional context",
  "details": "This content is initially hidden only because display.hideOnStart is true.",
  "display": {
    "hideOnStart": true,
    "reveal": "click"
  }
}
```

Supported reveal values:

- `click`: shows a compact Show details / Hide details toggle
- `hover`: reveals details while the card is hovered or focused

Completed Sequence elements show a compact `Reset` control instead of showing a restart control on every active element. Resetting a completed concurrent group item clears only that item. Resetting a completed linear step rewinds the path from that step because later steps may depend on its answer or route.

To remove the reset control from an element, set `hideReset: true`, `showReset: false`, or `reset: false` on the node or under `display`. The app validates this at load time: an element can hide its own reset only when it is inside a parent group or loop that still has a reset control available.

If a completed group or loop has no `title`, `question`, or `details`, its Reset control is rendered on the first child element that does have one of those fields. This avoids a standalone reset row on visually empty parent wrappers while still resetting the parent group or loop.

When a decision is answered, the answer buttons remain visible. The selected answer is highlighted in green and unselected answers are muted. If the element is marked `critical`, the selected answer uses red highlighting instead.

Action elements with an explicit `"next": null` do not show a Continue button. This is useful for informational items that should remain visible but should not advance the sequence on their own.

## Display Options

Optional display controls can be placed under `display`:

```json
{
  "display": {
    "hideFromNavigation": true,
    "hideOnStart": true,
    "reveal": "click",
    "critical": true
  }
}
```

Supported display controls:

- `hideFromNavigation`: removes the element from the Sequence navigation/history menu
- `showInNavigation: false`: alternate form for hiding the element from navigation
- `hideOnStart`: hides details/actions/links until revealed
- `reveal`: `click` or `hover`
- `critical`: highlights the element with a slight red background and red border
- `hideReset`: hides the completed element's Reset control when a parent element can reset it
- `showReset: false`: alternate form for hiding the completed element's Reset control
- `reset: false`: alternate form for hiding the completed element's Reset control
- `hideIterationCount`: hides the visible iteration count for loop headers
- `showIterationCount: false`: alternate form for hiding loop iteration count

Top-level node fields also support `critical: true`, `hideReset: true`, `showReset: false`, `reset: false`, `hideFromNavigation: true`, `showInNavigation: false`, or `navigation: false`.

Navigation labels can be customized with `navigationTitle`, `navTitle`, `navigationName`, `navName`, or matching fields under `display`.

If a visual field is explicitly set to `null`, it is omitted instead of falling back to default display text. This applies to fields such as `displayType`, `title`, `question`, `details`, and `tooltip`.

Clicking an item in the Sequence navigation menu scrolls to that element, flashes a prominent green outline, and keeps the outline visible until that element is scrolled out of view. Normal scrolling does not select or highlight a new element.

Completion auto-scroll is intentionally scoped to top-level Sequence elements. Completing nested elements inside an active group or loop does not move the page unless that completion also completes the top-level parent, in which case the next top-level active element scrolls to the top.

## Groups And Loops

JSON is still the preferred flow format. Nested `nodes` objects are explicit enough for grouped and looping behavior while staying portable and easy to inspect.

A `group` or `loop` node has:

- `startId`: first internal node id
- `nodes`: internal node object
- `condition.source`: internal decision node id that controls completion or repeat behavior
- `condition.answers`: map of answer keys to outcomes
- `next`: node id to continue to after completion

For groups that should display independent elements at the same time, use `items` instead of `startId`:

```json
{
  "type": "group",
  "title": "Concurrent review",
  "items": ["intake_check", "risk_check", "repeat_checks"],
  "nodes": {}
}
```

Grouped child nodes can define layout width:

```json
{
  "layout": {
    "width": "half"
  }
}
```

Supported widths:

- `full`: fills the group width
- `half`: takes one of two equal columns on wider screens and full width on mobile
- omitted: defaults to the compact half-column placement in concurrent groups

For concurrent groups, conditions can use `completeWhen` and `repeatWhen` lists:

```json
{
  "condition": {
    "completeMode": "all",
    "completeWhen": [
      { "source": "intake_check", "answer": "next" },
      { "source": "repeat_checks", "outcome": "complete" },
      { "source": "risk_check", "answer": "yes" }
    ],
    "repeatWhen": [
      { "source": "risk_check", "answer": "no" }
    ]
  }
}
```

`completeMode` controls whether completion requires every condition or only one:

AND completion:

```json
{
  "condition": {
    "completeMode": "all",
    "completeWhen": [
      { "source": "element_1", "answer": "next" },
      { "source": "element_2", "answer": "yes" }
    ]
  }
}
```

OR completion:

```json
{
  "condition": {
    "completeMode": "any",
    "completeWhen": [
      { "source": "element_1", "answer": "next" },
      { "source": "element_2", "answer": "yes" }
    ]
  }
}
```

Resetting a completed child item inside a group resets only that child item and reopens any completed parent path as needed. Sibling elements keep their completed state. Use the parent group or loop Reset button when the whole grouped section should be cleared.

When a group or loop completes, all child elements render as completed and greyed out, even if the parent completion control or completion condition ended the group before every child collected its own answer.

Groups and loops can also own their completion controls. This removes continue/decision controls from the child elements inside the group and renders the completion control at the group level:

Simple group-level Continue button:

```json
{
  "type": "group",
  "title": "Review visible items",
  "items": ["item_1", "item_2"],
  "groupCompletion": true,
  "next": "handoff",
  "nodes": {}
}
```

Group-level decision:

```json
{
  "type": "group",
  "title": "Review visible items",
  "items": ["item_1", "item_2"],
  "groupCompletion": {
    "type": "decision",
    "question": "Can this group be completed?",
    "answers": [
      {
        "id": "complete",
        "label": "Complete group",
        "target": "$complete",
        "variant": "primary"
      },
      {
        "id": "repeat",
        "label": "Repeat group",
        "target": "$repeat"
      }
    ]
  },
  "nodes": {}
}
```

Supported group-level control fields:

- `groupCompletion: true`: show one group-level Continue button that completes the group
- `groupCompletion: "continue"`: same as `true`
- `groupCompletion`: object defining the group-level control
- `type`: `action` / `continue` for a Continue button or `decision` for answer buttons
- `label`: action button text
- `question`: optional prompt shown above decision answers
- `answers`: decision answers using the same format as node decisions
- `target` / `next`: default group-level action target; defaults to `$complete`

If `completeMode` is omitted, it defaults to `all`. `repeatMode` is also supported with the same values and defaults to `any`.

Supported condition outcomes:

- `$repeat`: clear the current group or loop path and restart at its `startId`
- `$complete`: mark the current group or loop complete and continue to its `next`
- `$next`: same as `$complete`
- any node id: mark the current group or loop complete and continue to that node in the parent context

Example loop inside a group:

```json
{
  "type": "loop",
  "title": "Repeat checks until stable",
  "startId": "perform_check",
  "condition": {
    "source": "stable_check",
    "answers": {
      "yes": "$complete",
      "no": "$repeat"
    }
  },
  "next": "review_result",
  "nodes": {
    "perform_check": {
      "type": "action",
      "title": "Perform check",
      "next": "stable_check"
    },
    "stable_check": {
      "type": "decision",
      "title": "Stable result?",
      "question": "Is the repeated check stable enough to continue?",
      "yes": "$complete",
      "no": "$repeat"
    }
  }
}
```

Links use this shape:

```json
{
  "label": "Resource name",
  "url": "https://example.com",
  "tooltip": "Optional hover text for the link."
}
```

Example:

```json
{
  "id": "sample",
  "title": "Sample Flow",
  "startId": "start",
  "nodes": {
    "start": {
      "type": "decision",
      "displayType": "Choice",
      "title": "Confirm inputs",
      "question": "Do you have the required inputs?",
      "details": "Make sure all required details are available.",
      "tooltip": "Use this gate before continuing.",
      "links": [
        {
          "label": "Checklist",
          "url": "checklist.html",
          "tooltip": "Open the supporting checklist."
        }
      ],
      "yes": "perform_work",
      "no": "collect_inputs"
    },
    "perform_work": {
      "type": "action",
      "title": "Perform work",
      "details": "Complete the main task.",
      "next": "done"
    },
    "done": {
      "type": "end",
      "title": "Done",
      "details": "The process is complete."
    }
  }
}
```

## Adding A Flow

1. Add a new JSON file under `flows/`.
2. Add an entry to `flows/manifest.json`.
3. Set `defaultFlowId` in `flows/manifest.json`, or link directly with `index.html?flow=<flow-id>`.
4. Open or refresh `index.html`.

When hosted on a static web server, flow files load directly from `flows/` with a cache-busting request so refreshed JSON changes are parsed. If `index.html` is opened directly from disk and the browser blocks JSON file loading, the app uses `flows/bundled-flows.js` only as a fallback registry. Open the folder through a static web server to load and parse JSON flow content.

## Current Plan

- Build a static, portable baseline with no dependencies.
- Keep the data schema small and easy to edit by hand.
- Render Sequence mode as text-first workflow guidance.
- Render Sequence mode as a visible process timeline with completed blocks greyed out.
- Keep Sequence nodes compact enough for dense active groups to remain visible without hiding content by default.
- Use compact Sequence controls and scoped reset buttons for completed elements.
- Keep answered decision choices visible with selected and unselected visual states.
- Support navigation hiding, nav-click flashing outlines, null visual fields, and critical element highlighting.
- Support custom Sequence navigation labels.
- Use nav-click-only flashing highlights and optional hidden loop iteration counts.
- Support group-owned completion controls and scoped child resets inside grouped sections.
- Support grouped linear elements and nested loops with condition-based repeat and completion outcomes.
- Keep loop iteration history collapsed under the loop group for now.
- Render Flow Chart mode as a top-to-bottom tree with hover/focus details.
- Allow Flow Chart mode to use linked image assets instead of the generated tree when the flow JSON defines chart images.
- Support custom display labels, node links, flow-level links, and tooltips.
- Provide chart zoom controls, map-style drag panning, and fit the chart to the visible browser area by default.
- Provide an image selector in Flow Chart mode when a flow defines multiple chart images or image versions.
- Use explicit connector lines and branch labels between linked nodes.
- Keep the Flow Chart detail panel matched to the chart window height and present selected nodes with sequence-style details, actions, links, and routes.
- Include basic flow validation and readable error messages.

## Open Items / Todos

- Add optional browser storage so users can resume sequence progress later.
- Add expandable loop iteration history if users need to inspect prior loop passes.
- Add import/export tools if non-bundled flow authoring becomes useful.
- Add schema documentation for optional fields such as tags, owners, and estimated duration.
- Add automated UI tests if the app grows beyond the static baseline.
