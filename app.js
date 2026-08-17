"use strict";

const DEFAULT_FLOW = {
  id: "generic-process",
  title: "Generic Non-linear Process Review",
  description:
    "A sample flow showing linear steps, a grouped section, and a loop that repeats until a condition is met.",
  tooltip: "This sample demonstrates linear nodes, grouped nodes, loop nodes, completion conditions, and hover details.",
  links: [
    {
      label: "README schema",
      url: "README.md",
      tooltip: "Open the local README section that documents the flow format."
    }
  ],
  startId: "start",
  nodes: {
    start: {
      type: "action",
      displayType: "Task",
      title: "Open request",
      details:
        "Start the process with a linear action. Completed actions remain visible and fade into the timeline.",
      actions: ["Confirm the process is ready to begin.", "Move to the grouped work section."],
      next: "work_group"
    },
    work_group: {
      type: "group",
      displayType: "Grouped work",
      title: "Prepare and review work",
      details:
        "This group displays independent elements together. The two half-width elements share a row while the loop spans the full width.",
      items: ["collect_inputs", "review_result", "sampling_loop"],
      condition: {
        completeMode: "all",
        completeWhen: [
          { source: "collect_inputs", answer: "next" },
          { source: "sampling_loop", outcome: "complete" },
          { source: "review_result", answer: "accept" }
        ],
        repeatWhen: [
          { source: "review_result", answer: "revise" },
          { source: "review_result", answer: "exception" }
        ]
      },
      next: "handoff",
      nodes: {
        collect_inputs: {
          type: "action",
          displayType: "Task",
          title: "Collect inputs",
          details: "Gather the required information before running the repeated checks.",
          layout: {
            width: "half"
          },
          actions: ["Request missing details.", "Record any assumptions."],
          next: "$complete"
        },
        sampling_loop: {
          type: "loop",
          displayType: "Loop",
          title: "Repeat checks until stable",
          details:
            "This loop repeats its internal linear flow until the loop condition says the checks are stable.",
          layout: {
            width: "full"
          },
          startId: "perform_check",
          condition: {
            source: "stable_check",
            answers: {
              yes: "$complete",
              no: "$repeat"
            }
          },
          next: "review_result",
          nodes: {
            perform_check: {
              type: "action",
              displayType: "Task",
              title: "Perform check",
              details: "Run one pass of the repeated work.",
              actions: ["Perform the check.", "Capture the result."],
              next: "stable_check"
            },
            stable_check: {
              type: "decision",
              displayType: "Decision",
              title: "Stable result?",
              question: "Is the repeated check stable enough to continue?",
              details: "Choose No to repeat the loop. Choose Yes to complete the loop and return to the group.",
              yes: "$complete",
              no: "$repeat"
            }
          }
        },
        review_result: {
          type: "decision",
          displayType: "Decision",
          title: "Review grouped result",
          question: "Does the grouped work meet the exit condition?",
          details:
            "Choose the outcome that best describes the grouped work. Larger answer boxes can carry explanatory text.",
          layout: {
            width: "half"
          },
          answers: [
            {
              id: "accept",
              label: "Meets criteria",
              description: "Complete the grouped work and continue to handoff.",
              target: "$complete",
              size: "large",
              variant: "primary"
            },
            {
              id: "revise",
              label: "Needs revision",
              description: "Repeat the grouped work before continuing.",
              target: "$repeat",
              size: "large"
            },
            {
              id: "exception",
              label: "Requires exception review",
              description: "Repeat the group after exception review is documented.",
              target: "$repeat",
              size: "large"
            }
          ]
        }
      }
    },
    handoff: {
      type: "end",
      displayType: "Outcome",
      title: "Handoff complete",
      details:
        "The process is complete. Share the result, summarize verification, and list any known follow-up items.",
      tooltip: "Final state for a completed process.",
      actions: ["Deliver the output.", "Summarize checks performed.", "Call out open risks or next steps."]
    }
  }
};

const FALLBACK_MANIFEST = {
  defaultFlowId: "generic-process",
  flows: [
    {
      id: "generic-process",
      title: "Generic Process Review",
      file: "flows/default.json"
    }
  ]
};

const BUNDLED_FLOW_DATA = window.BUNDLED_FLOW_DATA || { manifest: null, flows: {} };

const state = {
  manifest: FALLBACK_MANIFEST,
  flow: DEFAULT_FLOW,
  currentId: DEFAULT_FLOW.startId,
  history: [],
  rootContext: null,
  activeContext: null,
  contextCounter: 0
};

let navHighlightedElement = null;
let navHighlightHasBeenVisible = false;

const elements = {
  flowTitle: document.querySelector("#flow-title"),
  flowDescription: document.querySelector("#flow-description"),
  flowLinks: document.querySelector("#flow-links"),
  status: document.querySelector("#status"),
  sequenceTab: document.querySelector("#sequence-tab"),
  chartTab: document.querySelector("#chart-tab"),
  sequencePanel: document.querySelector("#sequence-panel"),
  chartPanel: document.querySelector("#chart-panel"),
  sequenceStack: document.querySelector("#sequence-stack"),
  processNav: document.querySelector("#process-nav"),
  chartMain: document.querySelector(".chart-main"),
  chartViewport: document.querySelector("#chart-viewport"),
  chartCanvas: document.querySelector("#chart-canvas"),
  chartConnectors: document.querySelector("#chart-connectors"),
  chartTree: document.querySelector("#chart-tree"),
  zoomOut: document.querySelector("#zoom-out"),
  zoomIn: document.querySelector("#zoom-in"),
  zoomFit: document.querySelector("#zoom-fit"),
  zoomLabel: document.querySelector("#zoom-label"),
  chartImagePicker: document.querySelector("#chart-image-picker"),
  chartImagePickerLabel: document.querySelector("#chart-image-picker-label"),
  chartImageSelect: document.querySelector("#chart-image-select"),
  detailPanel: document.querySelector(".detail-panel"),
  detailType: document.querySelector("#detail-type"),
  detailStepLabel: document.querySelector("#detail-step-label"),
  detailTitle: document.querySelector("#detail-title"),
  detailQuestion: document.querySelector("#detail-question"),
  detailBody: document.querySelector("#detail-body"),
  detailActions: document.querySelector("#detail-actions"),
  detailLinks: document.querySelector("#detail-links"),
  detailRoutes: document.querySelector("#detail-routes")
};

const chartZoom = {
  scale: 1,
  min: 0.2,
  defaultMin: 0.2,
  max: 1.35,
  step: 0.1,
  x: 0,
  y: 0,
  isPanning: false,
  pointerId: null,
  startX: 0,
  startY: 0,
  originX: 0,
  originY: 0,
  dragMoved: false,
  suppressClick: false,
  imageIndex: 0
};

function setStatus(message, isError = false) {
  elements.status.textContent = message;
  elements.status.style.color = isError ? "var(--danger)" : "var(--success)";
}

function clearStatus() {
  elements.status.textContent = "";
}

async function loadJson(path) {
  const separator = path.includes("?") ? "&" : "?";
  const response = await fetch(`${path}${separator}_=${Date.now()}`, { cache: "no-store" });
  if (!response.ok) {
    throw new Error(`Could not load ${path}`);
  }

  const text = await response.text();
  try {
    return JSON.parse(text);
  } catch (error) {
    throw new Error(`Could not parse ${path}: ${error.message}`);
  }
}

async function initialize() {
  wireEvents();

  try {
    state.manifest = await loadJson("flows/manifest.json");
  } catch (error) {
    state.manifest = normalizeManifest(BUNDLED_FLOW_DATA.manifest) || FALLBACK_MANIFEST;
    setStatus("Using bundled flow data because this browser blocked local JSON loading.", false);
  }

  const defaultEntry = getInitialFlowEntry();

  if (defaultEntry) {
    await loadFlowEntry(defaultEntry);
  } else {
    applyFlow(DEFAULT_FLOW);
  }
}

function wireEvents() {
  elements.sequenceTab.addEventListener("click", () => setActivePanel("sequence"));
  elements.chartTab.addEventListener("click", () => setActivePanel("chart"));
  elements.chartImageSelect.addEventListener("change", (event) => {
    chartZoom.imageIndex = Number(event.target.value) || 0;
    renderChart();
  });
  elements.zoomOut.addEventListener("click", () => setChartZoom(chartZoom.scale - chartZoom.step));
  elements.zoomIn.addEventListener("click", () => setChartZoom(chartZoom.scale + chartZoom.step));
  elements.zoomFit.addEventListener("click", fitChartToViewport);
  elements.chartMain.addEventListener("click", handleChartViewerClick);
  elements.chartViewport.addEventListener("pointerdown", startChartPan);
  elements.chartViewport.addEventListener("pointermove", moveChartPan);
  elements.chartViewport.addEventListener("pointerup", endChartPan);
  elements.chartViewport.addEventListener("pointercancel", endChartPan);
  elements.chartViewport.addEventListener("lostpointercapture", endChartPan);
  window.addEventListener("resize", () => {
    if (!elements.chartPanel.classList.contains("is-hidden")) {
      fitChartToViewport();
    }
  });
  window.addEventListener("scroll", clearNavigationHighlightIfScrolledAway, { passive: true });
}

function setActivePanel(panel) {
  const sequenceActive = panel === "sequence";
  elements.sequenceTab.classList.toggle("is-active", sequenceActive);
  elements.chartTab.classList.toggle("is-active", !sequenceActive);
  elements.sequencePanel.classList.toggle("is-hidden", !sequenceActive);
  elements.chartPanel.classList.toggle("is-hidden", sequenceActive);

  if (!sequenceActive) {
    requestAnimationFrame(() => {
      drawChartConnectors();
      fitChartToViewport();
    });
  }
}

function getInitialFlowEntry() {
  const requestedFlowId = new URLSearchParams(window.location.search).get("flow");
  if (requestedFlowId) {
    const requestedEntry = state.manifest.flows.find((flow) => flow.id === requestedFlowId);
    if (requestedEntry) {
      return requestedEntry;
    }

    setStatus(`Requested flow '${requestedFlowId}' was not found in the manifest.`, true);
  }

  return (
    state.manifest.flows.find((flow) => flow.id === state.manifest.defaultFlowId) ||
    state.manifest.flows[0]
  );
}

async function loadFlowEntry(entry) {
  try {
    const flow = await loadFlow(entry);
    if (applyFlow(flow)) {
      clearStatus();
    }
  } catch (error) {
    if (entry.id === DEFAULT_FLOW.id) {
      applyFlow(DEFAULT_FLOW);
      setStatus("Using the bundled sample flow. Host this folder to load JSON files from disk.", false);
      return;
    }

    showFlowLoadError(entry, error.message);
    setStatus(error.message, true);
  }
}

async function loadFlow(entry) {
  try {
    return await loadJson(entry.file);
  } catch (error) {
    if (entry.id === DEFAULT_FLOW.id) {
      return DEFAULT_FLOW;
    }

    if (window.location.protocol === "file:") {
      throw new Error(
        `Cannot parse ${entry.file} while opened directly from disk. Open this folder through a static web server so the app can read the JSON file.`
      );
    }

    throw error;
  }
}

function normalizeManifest(manifest) {
  if (!manifest || !Array.isArray(manifest.flows)) {
    return null;
  }

  return manifest;
}

function showFlowLoadError(entry, message) {
  elements.flowTitle.textContent = entry.title || entry.id;
  renderDescription(elements.flowDescription, "This flow could not be loaded from its JSON file.", "");
  renderLinks(elements.flowLinks, []);

  elements.sequenceStack.innerHTML = "";
  const errorCard = document.createElement("article");
  errorCard.className = "sequence-card is-active";
  errorCard.innerHTML = `
    <div class="node-meta">
      <span class="node-type">Load error</span>
      <span>Flow not loaded</span>
    </div>
    <h2>JSON file unavailable</h2>
    <p class="details">${escapeHtml(message)}</p>
  `;
  elements.sequenceStack.append(errorCard);
  elements.processNav.innerHTML = "";

  elements.chartConnectors.innerHTML = "";
  elements.chartTree.innerHTML = "";
  elements.detailType.textContent = "Load error";
  elements.detailType.className = "node-type";
  elements.detailStepLabel.textContent = "Flow not loaded";
  elements.detailTitle.textContent = "JSON file unavailable";
  elements.detailQuestion.textContent = "";
  elements.detailQuestion.hidden = true;
  elements.detailBody.textContent = message;
  elements.detailActions.innerHTML = "";
  elements.detailLinks.innerHTML = "";
  elements.detailRoutes.innerHTML = "";
}

function applyFlow(flow) {
  const validation = validateFlow(flow);
  if (!validation.valid) {
    showFlowLoadError({ id: flow.id, title: flow.title }, validation.message);
    setStatus(validation.message, true);
    return false;
  }

  state.flow = flow;
  state.currentId = flow.startId;
  state.history = [];
  chartZoom.imageIndex = 0;
  initSequenceState();
  elements.flowTitle.textContent = flow.title;
  renderDescription(elements.flowDescription, flow.description || "No description provided.", flow.tooltip);
  renderLinks(elements.flowLinks, flow.links);
  renderSequence();
  renderChart();
  return true;
}

function validateFlow(flow) {
  if (!flow || typeof flow !== "object") {
    return { valid: false, message: "Flow data must be an object." };
  }

  if (!flow.startId || !flow.nodes || typeof flow.nodes !== "object") {
    return { valid: false, message: "Flow must include startId and nodes." };
  }

  if (!flow.nodes[flow.startId]) {
    return { valid: false, message: `Start node '${flow.startId}' does not exist.` };
  }

  return validateNodeScope(flow.nodes, flow.startId, "flow");
}

function validateNodeScope(nodes, startId, label, options = {}) {
  if (!nodes || typeof nodes !== "object") {
    return { valid: false, message: `${label} must include nodes.` };
  }

  if (!options.allowMissingStart && (!startId || !nodes[startId])) {
    return { valid: false, message: `${label} start node '${startId}' does not exist.` };
  }

  for (const [id, node] of Object.entries(nodes)) {
    if (!["decision", "action", "end", "group", "loop"].includes(node.type)) {
      return { valid: false, message: `Node '${id}' has an unsupported type.` };
    }

    if (node.links && !Array.isArray(node.links)) {
      return { valid: false, message: `Node '${id}' links must be an array.` };
    }

    if (hidesResetControl(node) && !options.hasParentReset) {
      return {
        valid: false,
        message: `Node '${id}' hides its reset control but does not have a parent element that can reset it.`
      };
    }

    if (node.type === "decision") {
      const answerValidation = validateDecisionAnswers(node, id);
      if (!answerValidation.valid) {
        return answerValidation;
      }
    }

    if (node.type === "group" || node.type === "loop") {
      const isConcurrentGroup = node.type === "group" && Array.isArray(node.items);
      const childValidation = validateNodeScope(node.nodes, node.startId, `${node.type} '${id}'`, {
        allowMissingStart: isConcurrentGroup,
        hasParentReset: !hidesResetControl(node)
      });
      if (!childValidation.valid) {
        return childValidation;
      }

      if (isConcurrentGroup) {
        for (const itemId of node.items) {
          if (!node.nodes[itemId]) {
            return { valid: false, message: `group '${id}' item '${itemId}' does not exist.` };
          }
        }
      }

      if (node.condition) {
        const conditionValidation = validateCondition(node, id);
        if (!conditionValidation.valid) {
          return conditionValidation;
        }
      }
    }

    const targets = getNodeTargets(node).filter((target) => !isControlTarget(target));
    for (const target of targets) {
      if (target && !nodes[target]) {
        return { valid: false, message: `Node '${id}' points to missing node '${target}'.` };
      }
    }
  }

  return { valid: true };
}

function validateDecisionAnswers(node, id) {
  if (!node.answers) {
    return { valid: true };
  }

  const answers = getDecisionOptions(node);
  if (answers.length === 0) {
    return { valid: false, message: `Decision '${id}' answers must include at least one valid answer.` };
  }

  const ids = new Set();
  for (const answer of answers) {
    if (ids.has(answer.id)) {
      return { valid: false, message: `Decision '${id}' has duplicate answer id '${answer.id}'.` };
    }
    ids.add(answer.id);

    if (!answer.target) {
      return { valid: false, message: `Decision '${id}' answer '${answer.id}' must define target or next.` };
    }
  }

  return { valid: true };
}

function validateCondition(node, id) {
  for (const [field, value] of [
    ["completeMode", node.condition.completeMode],
    ["repeatMode", node.condition.repeatMode]
  ]) {
    if (value && !["all", "any"].includes(value)) {
      return { valid: false, message: `${node.type} '${id}' ${field} must be 'all' or 'any'.` };
    }
  }

  if (Array.isArray(node.condition.completeWhen) || Array.isArray(node.condition.repeatWhen)) {
    const conditions = [...(node.condition.completeWhen || []), ...(node.condition.repeatWhen || [])];
    for (const condition of conditions) {
      if (!condition.source || !node.nodes?.[condition.source]) {
        return { valid: false, message: `${node.type} '${id}' condition source '${condition.source}' is missing.` };
      }
    }
    return { valid: true };
  }

  if (!node.condition.source || !node.nodes?.[node.condition.source]) {
    return { valid: false, message: `${node.type} '${id}' condition source is missing.` };
  }

  if (!node.condition.answers || typeof node.condition.answers !== "object") {
    return { valid: false, message: `${node.type} '${id}' condition must map answers to outcomes.` };
  }

  return { valid: true };
}

function initSequenceState() {
  state.contextCounter = 0;
  state.rootContext = createContext({
    kind: "flow",
    id: "root",
    title: state.flow.title,
    nodes: state.flow.nodes,
    startId: state.flow.startId,
    parent: null,
    containerNode: null
  });
  state.activeContext = state.rootContext;
  enterContainerNodes();
}

function createContext({ kind, id, title, nodes, startId, parent, containerNode }) {
  state.contextCounter += 1;
  const mode = kind === "group" && Array.isArray(containerNode?.items) ? "concurrent" : "linear";
  const context = {
    uid: `ctx-${state.contextCounter}`,
    kind,
    id,
    title,
    nodes,
    startId,
    currentId: mode === "linear" ? startId : null,
    parent,
    containerNode,
    entries: [],
    answers: {},
    mode,
    completed: false,
    iteration: 1
  };

  if (mode === "concurrent") {
    initializeConcurrentEntries(context);
  }

  return context;
}

function initializeConcurrentEntries(context) {
  context.entries = context.containerNode.items.map((itemId) => {
    const node = context.nodes[itemId];
    if (node.type === "group" || node.type === "loop") {
      const child = createContext({
        kind: node.type,
        id: itemId,
        title: node.title || itemId,
        nodes: node.nodes,
        startId: node.startId,
        parent: context,
        containerNode: node
      });
      return { kind: "context", id: itemId, context: child, completed: false };
    }

    return {
      kind: "node",
      uid: `step-${context.uid}-${itemId}`,
      id: itemId,
      node,
      completed: false,
      answer: null,
      choice: null
    };
  });
  context.answers = {};
  context.currentId = null;
}

function getCurrentNode() {
  if (state.activeContext?.mode === "concurrent") {
    const activeEntry = findFirstActiveEntry(state.activeContext);
    return activeEntry?.kind === "node" ? activeEntry.node : null;
  }

  return state.activeContext?.nodes?.[state.activeContext.currentId] || null;
}

function renderSequence(options = {}) {
  if (!state.rootContext) {
    return;
  }

  elements.sequenceStack.innerHTML = "";
  renderContextEntries(elements.sequenceStack, state.rootContext);
  renderProcessNav();
  renderActiveDetail();

  if (options.scrollAfterTopLevelCompletion) {
    scrollNextTopLevelActiveAfterCompletion(options.previousTopLevelKey);
  }
}

function getActiveTopLevelKey() {
  const root = state.rootContext;
  const active = state.activeContext;
  if (!root || !active) {
    return "";
  }

  if (active === root) {
    return root.currentId ? `node:${root.currentId}` : "";
  }

  let current = active;
  while (current.parent && current.parent !== root) {
    current = current.parent;
  }

  return current.parent === root ? `context:${current.id}` : "";
}

function scrollNextTopLevelActiveAfterCompletion(previousTopLevelKey) {
  if (!previousTopLevelKey || !isTopLevelKeyComplete(previousTopLevelKey)) {
    return;
  }

  requestAnimationFrame(() => {
    const nextActive = elements.sequenceStack.querySelector(
      ":scope > .sequence-card.is-active, :scope > .sequence-group.is-active"
    );
    nextActive?.scrollIntoView({ behavior: "smooth", block: "start" });
  });
}

function isTopLevelKeyComplete(key) {
  const root = state.rootContext;
  if (!root) {
    return false;
  }

  const [kind, id] = key.split(":");
  const entry = root.entries.find((candidate) => candidate.kind === kind && candidate.id === id);
  if (!entry) {
    return false;
  }

  return kind === "context" ? entry.context.completed || entry.completed : true;
}

function renderActionList(container, actions = []) {
  container.innerHTML = "";
  if (!Array.isArray(actions)) {
    return;
  }

  actions.filter((action) => action != null && action !== "").forEach((action) => {
    const item = document.createElement("div");
    item.className = "action-item";
    item.textContent = action;
    container.append(item);
  });
}

function renderDescription(container, text, tooltip) {
  container.textContent = text;
  if (!tooltip) {
    return;
  }

  const tip = document.createElement("span");
  tip.className = "inline-tooltip";
  tip.textContent = "?";
  tip.tabIndex = 0;
  tip.title = tooltip;
  tip.setAttribute("aria-label", tooltip);
  container.append(" ", tip);
}

function renderLinks(container, links = []) {
  container.innerHTML = "";
  if (!Array.isArray(links)) {
    return;
  }

  links.forEach((link) => {
    if (!link || !link.url || !link.label) {
      return;
    }

    const anchor = document.createElement("a");
    anchor.className = "resource-link";
    anchor.href = link.url;
    anchor.textContent = link.label;
    anchor.title = link.tooltip || link.label;
    if (/^https?:\/\//i.test(link.url)) {
      anchor.target = "_blank";
      anchor.rel = "noreferrer";
    }
    container.append(anchor);
  });
}

function createButton(label, style, onClick, ariaLabel = label) {
  const button = document.createElement("button");
  button.type = "button";
  button.className = `button ${style}`;
  button.textContent = label;
  button.setAttribute("aria-label", ariaLabel);
  button.addEventListener("click", onClick);
  return button;
}

function createAnswerButton(answer, onClick, options = {}) {
  const button = document.createElement("button");
  button.type = "button";
  button.className = `answer-button ${answer.variant || "secondary"}`;
  button.classList.toggle("is-large", answer.size === "large" || Boolean(answer.description));
  button.classList.toggle("is-critical-answer", Boolean(options.critical));
  button.addEventListener("click", onClick);

  const label = document.createElement("strong");
  label.textContent = answer.label;
  button.append(label);

  if (answer.description) {
    const description = document.createElement("span");
    description.textContent = answer.description;
    button.append(description);
  }

  return button;
}

function createCompletedAnswerButton(answer, selectedAnswer, options = {}) {
  const button = createAnswerButton(answer, () => {}, options);
  button.disabled = true;
  button.classList.add("is-answered");
  button.classList.toggle("is-selected", answer.id === selectedAnswer);
  button.classList.toggle("is-unselected", answer.id !== selectedAnswer);
  return button;
}

function restartSequence() {
  initSequenceState();
  renderSequence();
}

function renderContextEntries(container, context, options = {}) {
  const groupOwnsControls = options.suppressControls || hasGroupCompletionControl(context);
  const forceComplete = Boolean(options.forceComplete || context.completed);
  const resetDelegations = options.resetDelegations || [];
  if (context.mode === "concurrent") {
    container.classList.add("is-concurrent");
    context.entries.forEach((entry) => {
      if (entry.kind === "context") {
        container.append(
          renderContextBlock(entry.context, {
            suppressControls: groupOwnsControls,
            forceComplete,
            resetDelegations
          })
        );
        return;
      }

      container.append(
        renderNodeBlock(entry, !forceComplete && !entry.completed && !groupOwnsControls, context, {
          suppressControls: groupOwnsControls,
          forceComplete,
          resetDelegations
        })
      );
    });
    return;
  }

  context.entries.forEach((entry) => {
    if (entry.kind === "context") {
      container.append(
        renderContextBlock(entry.context, {
          suppressControls: groupOwnsControls,
          forceComplete,
          resetDelegations
        })
      );
      return;
    }

    container.append(
      renderNodeBlock(entry, false, context, {
        suppressControls: groupOwnsControls,
        forceComplete,
        resetDelegations
      })
    );
  });

  const shouldRenderActiveNode =
    context.currentId &&
    !hasRenderedCurrentEntry(context) &&
    (forceComplete || context === state.activeContext || context.parent?.mode === "concurrent");
  if (shouldRenderActiveNode) {
    const node = context.nodes[context.currentId];
    if (node) {
      container.append(
        renderNodeBlock({ kind: "node", id: context.currentId, node }, !forceComplete && !groupOwnsControls, context, {
          suppressControls: groupOwnsControls,
          forceComplete,
          resetDelegations
        })
      );
    }
  }
}

function renderContextBlock(context, options = {}) {
  const block = document.createElement("section");
  const forceComplete = Boolean(options.forceComplete || context.completed);
  const node = context.containerNode;
  const hasPrimaryContent = hasNodePrimaryContent(node);
  const resetDelegations = options.resetDelegations ? [...options.resetDelegations] : [];
  const shouldShowContextReset = context.completed && !hidesResetControl(node);
  if (shouldShowContextReset && !hasPrimaryContent) {
    resetDelegations.push({
      consumed: false,
      onReset: () => resetContextProgress(context),
      label: `Reset ${context.title || context.id}`
    });
  }

  block.className = `sequence-group ${context.kind === "loop" ? "is-loop" : "is-group"}`;
  block.classList.toggle("is-complete", forceComplete);
  block.classList.toggle("is-active", !forceComplete && isContextActive(context));
  block.classList.toggle("is-concurrent-group", context.mode === "concurrent");
  block.classList.toggle("is-critical", isCriticalNode(context.containerNode));
  applyWidthClass(block, context.containerNode?.layout?.width);
  block.id = context.uid;

  const header = document.createElement("div");
  header.className = "sequence-group-header";
  const summary = document.createElement("div");
  const meta = renderNodeMeta(node, getContextStatusText(context));
  if (meta) {
    summary.append(meta);
  }

  const titleText = getTitleText(node, context.id);
  const titleRow = document.createElement("div");
  titleRow.className = "element-title-row";
  if (titleText) {
    const title = document.createElement("h2");
    title.textContent = titleText;
    titleRow.append(title);
  }

  const consumedDelegatedReset = consumeDelegatedReset(resetDelegations, node, titleRow);
  if (shouldShowContextReset && hasPrimaryContent && !consumedDelegatedReset) {
    titleRow.append(renderResetControls(() => resetContextProgress(context), `Reset ${context.title || context.id}`));
  }

  if (titleRow.children.length > 0) {
    summary.append(titleRow);
  }

  const detailsText = getDetailsText(node, "Complete the grouped steps below.");
  if (detailsText) {
    const details = document.createElement("p");
    details.className = "details";
    details.textContent = detailsText;
    summary.append(details);
  }

  if (summary.children.length > 0) {
    header.append(summary);
  }

  if (header.children.length > 0) {
    block.append(header);
  }

  const inner = document.createElement("div");
  inner.className = "sequence-group-body";
  renderContextEntries(inner, context, {
    suppressControls: options.suppressControls || hasGroupCompletionControl(context),
    forceComplete,
    resetDelegations
  });
  block.append(inner);

  if (!forceComplete && !options.suppressControls && hasGroupCompletionControl(context)) {
    block.append(renderGroupCompletionControls(context));
  }

  return block;
}

function renderNodeBlock(entry, isActive, context, options = {}) {
  const node = entry.node;
  const forceComplete = Boolean(options.forceComplete);
  const resetDelegations = options.resetDelegations || [];
  const card = document.createElement("article");
  card.className = "sequence-card";
  card.classList.toggle("is-active", isActive);
  card.classList.toggle("is-complete", forceComplete || entry.completed || (!isActive && !options.suppressControls));
  card.classList.toggle("is-group-controlled", Boolean(options.suppressControls));
  card.classList.toggle("is-critical", isCriticalNode(node));
  applyWidthClass(card, node.layout?.width);
  card.id = isActive ? `active-${entry.id}` : entry.uid || `node-${entry.id}-${state.history.length}`;

  const meta = renderNodeMeta(node, "");
  if (meta) {
    card.append(meta);
  }

  const titleText = getTitleText(node, entry.id);
  const titleRow = document.createElement("div");
  titleRow.className = "element-title-row";
  if (titleText) {
    const title = document.createElement("h2");
    title.textContent = titleText;
    titleRow.append(title);
  }

  const consumedDelegatedReset = consumeDelegatedReset(resetDelegations, node, titleRow);
  const showReset =
    !isActive && context && !options.suppressControls && !hidesResetControl(node) && (!forceComplete || entry.completed);
  if (showReset && !consumedDelegatedReset) {
    titleRow.append(renderResetControls(() => resetNodeEntry(context, entry), `Reset ${node.title || entry.id}`));
  }

  if (titleRow.children.length > 0) {
    card.append(titleRow);
  }

  if (hasDisplayValue(node.question)) {
    const question = document.createElement("p");
    question.className = "question";
    question.textContent = node.question;
    card.append(question);
  }

  const content = document.createElement("div");
  content.className = "node-content";

  const detailsText = getDetailsText(node, getDetailsFallback(node));
  if (detailsText) {
    const details = document.createElement("p");
    details.className = "details";
    details.textContent = detailsText;
    content.append(details);
  }

  const actions = document.createElement("div");
  actions.className = "action-list";
  renderActionList(actions, node.actions);
  content.append(actions);

  const links = document.createElement("div");
  links.className = "link-list";
  renderLinks(links, node.links);
  content.append(links);

  applyContentReveal(card, content, node);
  card.append(content);

  if (isActive && !options.suppressControls) {
    const activeControls = renderActiveControls(node, context, entry.id);
    if (activeControls) {
      card.append(activeControls);
    }
  } else if (context && !options.suppressControls) {
    if (node.type === "decision" && entry.answer) {
      card.append(renderCompletedAnswerControls(node, entry.answer));
    }
  }

  return card;
}

function renderNodeMeta(node, statusText) {
  const displayType = getDisplayType(node);
  const hasType = hasDisplayValue(displayType);
  const hasStatus = hasDisplayValue(statusText);
  if (!hasType && !hasStatus) {
    return null;
  }

  const meta = document.createElement("div");
  meta.className = "node-meta";

  if (hasType) {
    const type = document.createElement("span");
    type.className = `node-type ${node.type}`;
    type.textContent = displayType;
    meta.append(type);
  }

  if (hasStatus) {
    const status = document.createElement("span");
    status.textContent = statusText;
    meta.append(status);
  }

  return meta;
}

function applyContentReveal(card, content, node) {
  const display = node.display || {};
  const hideOnStart = display.hideOnStart || display.hideContentOnStart || node.hideOnStart || node.hideContentOnStart;
  if (!hideOnStart) {
    return;
  }

  const reveal = display.reveal || display.revealOn || node.reveal || "click";
  card.classList.add("has-hidden-content", reveal === "hover" ? "reveal-hover" : "reveal-click");

  if (reveal === "hover") {
    card.tabIndex = 0;
    const hint = document.createElement("div");
    hint.className = "content-reveal-hint";
    hint.textContent = "Details reveal on hover or focus.";
    card.append(hint);
    return;
  }

  content.hidden = true;
  const toggle = document.createElement("button");
  toggle.type = "button";
  toggle.className = "content-toggle";
  toggle.textContent = "Show details";
  toggle.addEventListener("click", () => {
    content.hidden = !content.hidden;
    toggle.textContent = content.hidden ? "Show details" : "Hide details";
  });
  card.append(toggle);
}

function renderActiveControls(node, context, nodeId) {
  const controls = document.createElement("div");
  controls.className = "button-row";

  if (node.type === "decision") {
    controls.classList.add("answer-grid");
    getDecisionOptions(node).forEach((answer) => {
      controls.append(
        createAnswerButton(answer, () => completeNodeInContext(context.uid, nodeId, answer.id, answer.label), {
          critical: isCriticalNode(node)
        })
      );
    });
  }

  if (node.type === "action" && !hasExplicitNullNext(node)) {
    controls.append(createButton("Continue", "primary", () => completeNodeInContext(context.uid, nodeId, "next", "Continue")));
  }

  if (node.type === "end") {
    controls.append(createButton("Restart flow", "primary", restartSequence));
  }

  return controls.children.length > 0 ? controls : null;
}

function renderGroupCompletionControls(context) {
  const node = context.containerNode;
  const control = getGroupCompletionControl(node);
  const controls = document.createElement("div");
  controls.className = "group-completion-controls";

  if (hasDisplayValue(control.question)) {
    const question = document.createElement("p");
    question.className = "question";
    question.textContent = control.question;
    controls.append(question);
  }

  const row = document.createElement("div");
  row.className = "button-row";

  if (control.type === "decision") {
    row.classList.add("answer-grid");
    getDecisionOptions(control).forEach((answer) => {
      row.append(
        createAnswerButton(answer, () => completeGroupFromControl(context, answer), {
          critical: isCriticalNode(node)
        })
      );
    });
  } else {
    row.append(
      createButton(control.label || "Continue", "primary", () =>
        completeGroupFromControl(context, {
          id: "next",
          label: control.label || "Continue",
          target: control.target || control.next || "$complete"
        })
      )
    );
  }

  controls.append(row);
  return controls;
}

function completeGroupFromControl(context, answer) {
  const previousTopLevelKey = getActiveTopLevelKey();
  recordAnswer(context, context.id, answer.id);
  const target = answer.target || answer.next || "$complete";
  applyConditionOutcome(context, target);
  clearStatus();
  enterContainerNodes();
  renderSequence({
    scrollAfterTopLevelCompletion: true,
    previousTopLevelKey
  });
}

function renderCompletedAnswerControls(node, selectedAnswer) {
  const controls = document.createElement("div");
  controls.className = "button-row answer-grid completed-answer-grid";
  getDecisionOptions(node).forEach((answer) => {
    controls.append(createCompletedAnswerButton(answer, selectedAnswer, { critical: isCriticalNode(node) }));
  });
  return controls;
}

function renderResetControls(onReset, label) {
  const controls = document.createElement("div");
  controls.className = "reset-row";
  controls.append(createButton("Reset", "secondary reset-button", onReset, label));
  return controls;
}

function completeCurrentNode(answerKey, choiceLabel) {
  const context = state.activeContext;
  completeNodeInContext(context.uid, context.currentId, answerKey, choiceLabel);
}

function completeNodeInContext(contextUid, nodeId, answerKey, choiceLabel) {
  const context = findContextByUid(contextUid);
  if (!context || !nodeId) {
    return;
  }

  const node = context.nodes[nodeId];
  if (!node) {
    setStatus(`Node '${nodeId}' does not exist in this flow context.`, true);
    return;
  }

  if (context.mode === "concurrent") {
    completeConcurrentNode(context, nodeId, node, answerKey, choiceLabel);
    return;
  }

  const previousTopLevelKey = getActiveTopLevelKey();
  const entry = {
    kind: "node",
    uid: `step-${Date.now()}-${Math.random().toString(16).slice(2)}`,
    id: nodeId,
    node,
    answer: answerKey,
    choice: choiceLabel
  };
  context.entries.push(entry);
  state.history.push({ id: entry.uid, title: node.title || nodeId, choice: choiceLabel });
  recordAnswer(context, nodeId, answerKey);

  const conditionOutcome = getConditionOutcome(context, nodeId, answerKey);
  if (conditionOutcome) {
    applyConditionOutcome(context, conditionOutcome);
  } else {
    routeWithinContext(context, getRouteTarget(node, answerKey));
  }

  clearStatus();
  enterContainerNodes();
  renderSequence({
    scrollAfterTopLevelCompletion: true,
    previousTopLevelKey
  });
}

function completeConcurrentNode(context, nodeId, node, answerKey, choiceLabel) {
  const entry = context.entries.find((candidate) => candidate.kind === "node" && candidate.id === nodeId);
  if (!entry || entry.completed) {
    return;
  }

  const previousTopLevelKey = getActiveTopLevelKey();
  entry.completed = true;
  entry.answer = answerKey;
  entry.choice = choiceLabel;
  recordAnswer(context, nodeId, answerKey);
  state.history.push({ id: entry.uid, title: node.title || nodeId, choice: choiceLabel });

  const conditionOutcome = getConditionOutcome(context, nodeId, answerKey);
  if (conditionOutcome) {
    applyConditionOutcome(context, conditionOutcome);
  }

  clearStatus();
  enterContainerNodes();
  renderSequence({
    scrollAfterTopLevelCompletion: true,
    previousTopLevelKey
  });
}

function resetNodeEntry(context, entry) {
  if (!context || !entry) {
    return;
  }

  if (context.mode === "concurrent") {
    entry.completed = false;
    entry.answer = null;
    entry.choice = null;
    delete context.answers[entry.id];
    removeHistoryUid(entry.uid);
    reopenContextBranch(context);
  } else {
    const entryIndex = context.entries.findIndex((candidate) => candidate === entry || candidate.uid === entry.uid);
    if (entryIndex < 0) {
      return;
    }

    const removedEntries = context.entries.splice(entryIndex);
    removeAnswersForEntries(context, removedEntries);
    context.currentId = entry.id;
    reopenContextBranch(context);
  }

  state.activeContext = context;
  clearStatus();
  enterContainerNodes();
  renderSequence();
}

function resetContextProgress(context) {
  if (!context) {
    return;
  }

  context.iteration = 1;
  resetContext(context);
  reopenContextBranch(context);
  state.activeContext = context;
  clearStatus();
  enterContainerNodes();
  renderSequence();
}

function reopenContextBranch(context) {
  let current = context;
  current.completed = false;

  while (current.parent) {
    const parent = current.parent;
    parent.completed = false;

    const parentEntry = parent.entries.find((entry) => entry.kind === "context" && entry.context === current);
    if (parentEntry) {
      parentEntry.completed = false;
      parentEntry.answer = null;
      parentEntry.choice = null;
      delete parent.answers[parentEntry.id];
    }

    if (parent.mode === "linear") {
      const entryIndex = parent.entries.findIndex((entry) => entry.kind === "context" && entry.context === current);
      if (entryIndex >= 0) {
        const removedEntries = parent.entries.splice(entryIndex + 1);
        removeAnswersForEntries(parent, removedEntries);
      }
      parent.currentId = null;
    }

    current = parent;
  }
}

function removeAnswersForEntries(context, entries) {
  entries.forEach((entry) => {
    delete context.answers[entry.id];

    if (entry.kind === "node") {
      removeHistoryUid(entry.uid);
      return;
    }

    if (entry.kind === "context") {
      removeHistoryForContext(entry.context);
    }
  });
}

function removeHistoryForContext(context) {
  context.entries.forEach((entry) => {
    if (entry.kind === "node") {
      removeHistoryUid(entry.uid);
      return;
    }

    if (entry.kind === "context") {
      removeHistoryForContext(entry.context);
    }
  });
}

function removeHistoryUid(uid) {
  state.history = state.history.filter((item) => item.id !== uid);
}

function recordAnswer(context, nodeId, answerKey) {
  context.answers[nodeId] = answerKey;
}

function getConditionOutcome(context, nodeId, answerKey) {
  const condition = context.containerNode?.condition;
  if (!condition) {
    return null;
  }

  if (Array.isArray(condition.repeatWhen) && matchesConditions(context, condition.repeatWhen, condition.repeatMode || "any")) {
    return "$repeat";
  }

  if (Array.isArray(condition.completeWhen) && matchesConditions(context, condition.completeWhen, condition.completeMode || "all")) {
    return "$complete";
  }

  if (condition.answers?.[`${nodeId}.${answerKey}`]) {
    return condition.answers[`${nodeId}.${answerKey}`];
  }

  if (condition.source && condition.source === nodeId) {
    return condition.answers?.[answerKey] || null;
  }

  return null;
}

function matchesConditions(context, conditions, mode) {
  const matcher = (condition) => context.answers[condition.source] === getConditionAnswer(condition);
  return mode === "any" ? conditions.some(matcher) : conditions.every(matcher);
}

function getConditionAnswer(condition) {
  return condition.answer || condition.outcome || "complete";
}

function applyConditionOutcome(context, outcome) {
  if (outcome === "$repeat") {
    resetContext(context);
    context.iteration += 1;
    return;
  }

  if (outcome === "$complete" || outcome === "$next") {
    completeContext(context, context.containerNode?.next || null);
    return;
  }

  completeContext(context, outcome);
}

function routeWithinContext(context, targetId) {
  if (!targetId) {
    if (context.parent) {
      completeContext(context, context.containerNode?.next || null);
    } else {
      context.currentId = null;
    }
    return;
  }

  if (isControlTarget(targetId)) {
    applyConditionOutcome(context, targetId);
    return;
  }

  if (context.nodes[targetId]) {
    context.currentId = targetId;
    return;
  }

  if (context.parent?.nodes?.[targetId]) {
    completeContext(context, targetId);
    return;
  }

  setStatus(`Next node '${targetId}' does not exist in this flow context.`, true);
}

function completeContext(context, nextTarget) {
  context.completed = true;
  const parent = context.parent;
  if (!parent) {
    context.currentId = null;
    return;
  }

  if (parent.mode === "concurrent") {
    const parentEntry = parent.entries.find((entry) => entry.kind === "context" && entry.context === context);
    if (parentEntry) {
      parentEntry.completed = true;
      parentEntry.answer = "complete";
      parentEntry.choice = "Complete";
    }
    recordAnswer(parent, context.id, "complete");
    state.activeContext = parent;
    const outcome = getConditionOutcome(parent, context.id, "complete");
    if (outcome) {
      applyConditionOutcome(parent, outcome);
    }
    return;
  }

  state.activeContext = parent;
  parent.currentId = nextTarget || context.containerNode?.next || null;
}

function resetContext(context) {
  context.completed = false;
  context.answers = {};
  if (context.mode === "concurrent") {
    initializeConcurrentEntries(context);
    return;
  }

  context.entries = [];
  context.currentId = context.startId;
}

function enterContainerNodes() {
  let guard = 0;
  while (state.activeContext?.mode === "linear" && state.activeContext?.currentId && guard < 25) {
    guard += 1;
    const context = state.activeContext;
    const node = context.nodes[context.currentId];
    if (!node || (node.type !== "group" && node.type !== "loop")) {
      break;
    }

    const child = createContext({
      kind: node.type,
      id: context.currentId,
      title: node.title || context.currentId,
      nodes: node.nodes,
      startId: node.startId,
      parent: context,
      containerNode: node
    });
    context.entries.push({ kind: "context", id: context.currentId, context: child });
    state.activeContext = child;
    if (child.mode === "concurrent") {
      break;
    }
  }
}

function renderProcessNav() {
  elements.processNav.innerHTML = "";
  const navItems = [];
  collectNavItems(state.rootContext, navItems);

  if (navItems.length === 0) {
    const empty = document.createElement("li");
    empty.textContent = "No completed steps yet.";
    elements.processNav.append(empty);
    return;
  }

  navItems.forEach((item) => {
    const li = document.createElement("li");
    const button = document.createElement("button");
    button.type = "button";
    button.textContent = item.title;
    button.className = item.complete ? "is-complete" : "is-active";
    button.addEventListener("click", () => focusElementFromNavigation(item.id));
    li.append(button);
    elements.processNav.append(li);
  });
}

function focusElementFromNavigation(elementId) {
  const target = document.getElementById(elementId);
  if (!target) {
    return;
  }

  clearNavigationHighlight();
  target.scrollIntoView({ behavior: "smooth", block: "start" });
  target.classList.remove("is-nav-highlight");
  void target.offsetWidth;
  target.classList.add("is-nav-highlight");
  navHighlightedElement = target;
  navHighlightHasBeenVisible = false;
}

function clearNavigationHighlight() {
  elements.sequenceStack.querySelectorAll(".is-nav-highlight").forEach((element) => {
    element.classList.remove("is-nav-highlight");
  });
  navHighlightedElement = null;
  navHighlightHasBeenVisible = false;
}

function clearNavigationHighlightIfScrolledAway() {
  if (!navHighlightedElement) {
    return;
  }

  if (!navHighlightedElement.isConnected) {
    clearNavigationHighlight();
    return;
  }

  const rect = navHighlightedElement.getBoundingClientRect();
  const isVisible = rect.bottom > 0 && rect.top < window.innerHeight;
  if (isVisible) {
    navHighlightHasBeenVisible = true;
    return;
  }

  if (navHighlightHasBeenVisible) {
    clearNavigationHighlight();
  }
}

function collectNavItems(context, items) {
  context.entries.forEach((entry) => {
    if (entry.kind === "context") {
      const title = getNavigationTitleText(entry.context.containerNode, entry.context.title);
      if (showsInNavigation(entry.context.containerNode) && title) {
        items.push({
          id: entry.context.uid,
          title,
          complete: entry.context.completed
        });
      }
      if (entry.context.kind !== "loop") {
        collectNavItems(entry.context, items);
      }
      return;
    }

    const title = getNavigationTitleText(entry.node, entry.id);
    if (showsInNavigation(entry.node) && title) {
      items.push({
        id: entry.uid,
        title,
        complete: true
      });
    }
  });

  if (context === state.activeContext && context.currentId) {
    const node = context.nodes[context.currentId];
    const title = getNavigationTitleText(node, context.currentId);
    if (showsInNavigation(node) && title) {
      items.push({
        id: `active-${context.currentId}`,
        title,
        complete: false
      });
    }
  }
}

function renderActiveDetail() {
  const node = getCurrentNode();
  if (node) {
    renderDetailNode(node, state.activeContext.currentId, state.activeContext.nodes);
  }
}

function findFirstActiveEntry(context) {
  for (const entry of context.entries) {
    if (entry.kind === "node" && !entry.completed) {
      return entry;
    }

    if (entry.kind === "context" && !entry.context.completed) {
      const childEntry = findFirstActiveEntry(entry.context);
      if (childEntry) {
        return childEntry;
      }

      if (entry.context.currentId) {
        return { kind: "node", id: entry.context.currentId, node: entry.context.nodes[entry.context.currentId] };
      }
    }
  }

  return null;
}

function findContextByUid(uid, context = state.rootContext) {
  if (!context) {
    return null;
  }

  if (context.uid === uid) {
    return context;
  }

  for (const entry of context.entries) {
    if (entry.kind === "context") {
      const match = findContextByUid(uid, entry.context);
      if (match) {
        return match;
      }
    }
  }

  return null;
}

function applyWidthClass(element, width) {
  if (width === "full") {
    element.classList.add("span-full");
    return;
  }

  if (width === "half") {
    element.classList.add("span-half");
    return;
  }

  element.classList.add("span-auto");
}

function isContextActive(context) {
  let current = state.activeContext;
  while (current) {
    if (current === context) {
      return true;
    }
    current = current.parent;
  }
  return false;
}

function getContextStatusText(context) {
  if (context.kind === "loop") {
    return showsLoopIteration(context.containerNode) ? `Iteration ${context.iteration}` : "";
  }

  return "";
}

function hasRenderedCurrentEntry(context) {
  if (!context?.currentId) {
    return false;
  }

  return context.entries.some((entry) => entry.id === context.currentId);
}

function consumeDelegatedReset(resetDelegations, node, titleRow) {
  if (!hasNodePrimaryContent(node)) {
    return false;
  }

  const delegation = resetDelegations?.find((item) => item && !item.consumed);
  if (!delegation) {
    return false;
  }

  titleRow.append(renderResetControls(delegation.onReset, delegation.label));
  delegation.consumed = true;
  return true;
}

function hasGroupCompletionControl(context) {
  return Boolean(getGroupCompletionControl(context?.containerNode));
}

function getGroupCompletionControl(node) {
  if (!node || (node.type !== "group" && node.type !== "loop")) {
    return null;
  }

  const display = node.display || {};
  const control =
    node.groupCompletion ||
    display.groupCompletion ||
    node.completionControl ||
    node.groupControl ||
    display.completionControl ||
    display.groupControl;

  if (control === true || control === "continue" || control === "action") {
    return {
      type: "action",
      label: "Continue",
      target: "$complete"
    };
  }

  if (control && typeof control === "object") {
    return {
      type: normalizeGroupCompletionType(control),
      question: control.question,
      label: control.label,
      target: control.target,
      next: control.next,
      answers: control.answers,
      yes: control.yes,
      no: control.no
    };
  }

  if (node.completeAtGroup || node.groupCompletes || display.completeAtGroup || display.groupCompletes) {
    return {
      type: "action",
      label: "Continue",
      target: "$complete"
    };
  }

  return null;
}

function normalizeGroupCompletionType(control) {
  if (control.type === "decision" || Array.isArray(control.answers)) {
    return "decision";
  }

  return "action";
}

function showsLoopIteration(node) {
  const display = node?.display || {};
  return !(
    node?.hideIteration ||
    node?.hideIterationCount ||
    node?.showIteration === false ||
    node?.showIterationCount === false ||
    display.hideIteration ||
    display.hideIterationCount ||
    display.showIteration === false ||
    display.showIterationCount === false
  );
}

function renderChart() {
  elements.chartConnectors.innerHTML = "";
  elements.chartTree.innerHTML = "";
  elements.chartTree.classList.remove("is-image-mode");
  elements.chartTree.style.width = "";
  elements.chartTree.style.height = "";
  const chartImages = getChartImages(state.flow);
  const hasChartImages = chartImages.length > 0;
  elements.chartPanel.classList.toggle("is-chart-image-mode", hasChartImages);
  renderChartImagePicker(chartImages);

  if (hasChartImages) {
    renderChartImage(chartImages[getActiveChartImageIndex(chartImages)]);
    return;
  }

  chartZoom.min = chartZoom.defaultMin;
  elements.chartTree.append(renderChartNode(state.flow.startId, new Set()));
  requestAnimationFrame(() => {
    drawChartConnectors();
    fitChartToViewport();
  });
}

function renderChartImagePicker(chartImages) {
  elements.chartImageSelect.innerHTML = "";
  const pickerLabel = getChartImagePickerLabel(chartImages);
  elements.chartImagePickerLabel.textContent = pickerLabel;
  elements.chartImagePickerLabel.hidden = !pickerLabel;
  elements.chartImagePicker.classList.toggle("is-hidden", chartImages.length <= 1);
  if (chartImages.length <= 1) {
    return;
  }

  chartImages.forEach((image, index) => {
    const option = document.createElement("option");
    option.value = String(index);
    option.textContent = image.label || `Image ${index + 1}`;
    elements.chartImageSelect.append(option);
  });
  elements.chartImageSelect.value = String(getActiveChartImageIndex(chartImages));
}

function renderChartImage(image) {
  if (!image) {
    return;
  }

  elements.chartTree.classList.add("is-image-mode");
  const stage = document.createElement("figure");
  stage.className = "chart-image-stage";

  const img = document.createElement("img");
  img.className = "chart-image";
  img.src = image.src;
  img.alt = image.alt || image.label || "Flow chart image";
  img.draggable = false;
  img.addEventListener("load", () => {
    setImageCanvasDimensions(img);
    fitChartToViewport();
  }, { once: true });
  stage.append(img);

  elements.chartTree.append(stage);
  renderChartImageDetail(image);
  requestAnimationFrame(() => {
    setImageCanvasDimensions(img);
    fitChartToViewport();
  });
}

function renderChartImageDetail(image) {
  elements.detailPanel.classList.remove("is-critical");
  elements.detailType.hidden = false;
  elements.detailType.textContent = "Image";
  elements.detailType.className = "node-type";
  elements.detailStepLabel.hidden = true;
  elements.detailTitle.hidden = false;
  elements.detailTitle.textContent = image.label || "Flow chart image";
  elements.detailQuestion.hidden = true;
  elements.detailBody.hidden = !image.description;
  elements.detailBody.textContent = image.description || "";
  renderActionList(elements.detailActions, image.actions);
  renderLinks(elements.detailLinks, image.links);
  elements.detailRoutes.innerHTML = "";
}

function getActiveChartImageIndex(chartImages) {
  if (chartZoom.imageIndex >= chartImages.length) {
    chartZoom.imageIndex = 0;
  }

  return chartZoom.imageIndex;
}

function getChartImages(flow) {
  const images = [];
  addChartImageSource(images, flow?.chartImage, "", "");
  addChartImageSource(images, flow?.chartImages, "", "");
  addChartImageSource(images, flow?.flowChartImage, "", "");
  addChartImageSource(images, flow?.flowChartImages, "", "");
  addChartImageSource(images, flow?.chart?.image, "", flow?.chart?.label || "");
  addChartImageSource(images, flow?.chart?.images, "", flow?.chart?.label || "");
  return images;
}

function addChartImageSource(images, source, groupLabel, pickerLabel) {
  if (!source) {
    return;
  }

  if (typeof source === "string") {
    images.push({
      id: `image-${images.length + 1}`,
      label: groupLabel || `Image ${images.length + 1}`,
      pickerLabel,
      src: source
    });
    return;
  }

  if (Array.isArray(source)) {
    source.forEach((item) => addChartImageSource(images, item, groupLabel, pickerLabel));
    return;
  }

  if (typeof source !== "object") {
    return;
  }

  const label = groupLabel || source.label || source.title || source.name;
  const nestedImages = source.images || source.versions;
  if (Array.isArray(nestedImages)) {
    const nextPickerLabel = pickerLabel || source.label || "";
    nestedImages.forEach((item) => {
      const nestedLabel = item?.label || item?.title || item?.name || label;
      addChartImageSource(images, item, nestedLabel, nextPickerLabel);
    });
    return;
  }

  const src = source.src || source.url || source.href || source.path || source.file;
  if (!src) {
    return;
  }

  images.push({
    id: source.id || `image-${images.length + 1}`,
    label: label || `Image ${images.length + 1}`,
    pickerLabel,
    src,
    alt: source.alt,
    caption: source.caption,
    description: source.description || source.details,
    links: source.links,
    actions: source.actions
  });
}

function getChartImagePickerLabel(chartImages) {
  const labels = chartImages.map((image) => image.pickerLabel).filter(Boolean);
  return labels[0] || "";
}

function renderChartNode(nodeId, path) {
  const node = state.flow.nodes[nodeId];
  const wrapper = document.createElement("div");
  wrapper.className = "tree-node";

  const card = document.createElement("div");
  card.setAttribute("role", "button");
  card.tabIndex = 0;
  card.className = `node-card ${node.type}`;
  card.classList.toggle("is-critical", isCriticalNode(node));
  card.dataset.nodeId = nodeId;

  const displayType = getDisplayType(node);
  if (hasDisplayValue(displayType)) {
    const type = document.createElement("span");
    type.textContent = displayType;
    card.append(type);
  }

  const titleText = getTitleText(node, nodeId);
  if (titleText) {
    const title = document.createElement("strong");
    title.textContent = titleText;
    card.append(title);
  }

  const tooltipText = getTooltipText(node);
  if (tooltipText) {
    const tooltip = document.createElement("div");
    tooltip.className = "tooltip";
    tooltip.textContent = tooltipText;
    card.append(tooltip);
  }

  card.addEventListener("mouseenter", () => renderDetailPanel(nodeId));
  card.addEventListener("focus", () => renderDetailPanel(nodeId));
  card.addEventListener("click", () => openNodeInSequence(nodeId));
  card.addEventListener("keydown", (event) => {
    if (event.key === "Enter" || event.key === " ") {
      event.preventDefault();
      openNodeInSequence(nodeId);
    }
  });
  wrapper.append(card);

  const linkRow = document.createElement("div");
  linkRow.className = "link-list node-links";
  renderLinks(linkRow, node.links);
  wrapper.append(linkRow);

  if (hasDisplayValue(node.tooltip)) {
    card.title = node.tooltip;
  }

  if (path.has(nodeId)) {
    return wrapper;
  }

  const nextPath = new Set(path);
  nextPath.add(nodeId);
  const branches = getBranches(node);

  if (branches.length > 0) {
    const branchContainer = document.createElement("div");
    branchContainer.className = "branches";

    branches.filter((branch) => !isControlTarget(branch.target) && state.flow.nodes[branch.target]).forEach((branch) => {
      const branchEl = document.createElement("div");
      branchEl.className = "branch";
      branchEl.dataset.parentId = nodeId;
      branchEl.dataset.targetId = branch.target;
      const label = document.createElement("span");
      label.className = "branch-label";
      label.textContent = branch.label;
      branchEl.append(label, renderChartNode(branch.target, nextPath));
      branchContainer.append(branchEl);
    });

    wrapper.append(branchContainer);
  }

  return wrapper;
}

function openNodeInSequence(nodeId) {
  if (chartZoom.suppressClick) {
    return;
  }

  initSequenceState();
  state.activeContext = state.rootContext;
  state.rootContext.currentId = nodeId;
  state.rootContext.entries = [];
  enterContainerNodes();
  renderSequence();
  setActivePanel("sequence");
}

function renderDetailPanel(nodeId) {
  const node = state.flow.nodes[nodeId];
  if (!node) {
    return;
  }

  renderDetailNode(node, nodeId, state.flow.nodes);
}

function renderDetailNode(node, nodeId, nodes) {
  elements.detailPanel.classList.toggle("is-critical", isCriticalNode(node));
  const titleText = getTitleText(node, nodeId);
  elements.detailTitle.textContent = titleText || "";
  elements.detailTitle.hidden = !titleText;

  const displayType = getDisplayType(node);
  elements.detailType.textContent = displayType || "";
  elements.detailType.className = `node-type ${node.type}`;
  elements.detailType.hidden = !hasDisplayValue(displayType);

  elements.detailStepLabel.textContent = hasDisplayValue(node.type) ? labelForType(node.type) : "";
  elements.detailStepLabel.hidden = !hasDisplayValue(node.type);

  elements.detailQuestion.textContent = hasDisplayValue(node.question) ? node.question : "";
  elements.detailQuestion.hidden = !hasDisplayValue(node.question);

  const detailsText = getDetailsText(node, getDetailsFallback(node));
  elements.detailBody.textContent = detailsText || "";
  elements.detailBody.hidden = !detailsText;
  renderActionList(elements.detailActions, node.actions);
  renderLinks(elements.detailLinks, node.links);
  renderRoutes(elements.detailRoutes, node, nodes);

  const contentWeight =
    (node.details || "").length +
    (node.question || "").length +
    (Array.isArray(node.actions) ? node.actions.join("").length : 0) +
    getBranches(node)
      .map((branch) => nodes[branch.target]?.title || "")
      .join("").length;
  elements.detailPanel.classList.toggle("is-dense", contentWeight > 520 || (node.actions || []).length > 3);
}

function renderRoutes(container, node, nodes = state.flow.nodes) {
  container.innerHTML = "";
  getBranches(node).forEach((branch) => {
    const target = nodes[branch.target];
    if (!target) {
      return;
    }

    const route = document.createElement("div");
    route.className = "route-item";
    const label = document.createElement("span");
    label.textContent = branch.label === "Next" ? "Continue to" : `${branch.label} path`;
    route.append(label);

    const titleText = getTitleText(target, branch.target);
    if (titleText) {
      const title = document.createElement("strong");
      title.textContent = titleText;
      route.append(title);
    }

    container.append(route);
  });
}

function getBranches(node) {
  if (node.type === "decision") {
    return getDecisionOptions(node).map((answer) => ({
      label: answer.label,
      target: answer.target,
      answerId: answer.id
    })).filter((branch) => branch.target);
  }

  if (node.type === "action" && node.next) {
    return [{ label: "Next", target: node.next }];
  }

  if ((node.type === "group" || node.type === "loop") && node.next) {
    return [{ label: "Complete", target: node.next }];
  }

  return [];
}

function getNodeTargets(node) {
  return getBranches(node).map((branch) => branch.target);
}

function getRouteTarget(node, answerKey) {
  if (node.type === "decision") {
    return getDecisionOptions(node).find((answer) => answer.id === answerKey)?.target || node[answerKey];
  }

  if (node.type === "action") {
    return node.next;
  }

  if (node.type === "end") {
    return null;
  }

  return node.next || null;
}

function hasExplicitNullNext(node) {
  return Object.prototype.hasOwnProperty.call(node || {}, "next") && node.next === null;
}

function isControlTarget(target) {
  return typeof target === "string" && target.startsWith("$");
}

function getDecisionOptions(node) {
  if (Array.isArray(node.answers) && node.answers.length > 0) {
    return node.answers.map((answer) => normalizeDecisionAnswer(answer)).filter(Boolean);
  }

  if (node.answers && typeof node.answers === "object") {
    return Object.entries(node.answers)
      .map(([id, answer]) => normalizeDecisionAnswer({ id, ...answer }))
      .filter(Boolean);
  }

  return [
    { id: "yes", label: "Yes", target: node.yes, variant: "primary" },
    { id: "no", label: "No", target: node.no, variant: "secondary" }
  ].filter((answer) => answer.target);
}

function normalizeDecisionAnswer(answer) {
  if (!answer || !answer.id) {
    return null;
  }

  return {
    id: answer.id,
    label: answer.label || answer.text || labelForType(answer.id),
    description: answer.description || answer.details || "",
    target: answer.target || answer.next,
    size: answer.size || "default",
    variant: answer.variant || "secondary"
  };
}

function labelForType(type) {
  return type.charAt(0).toUpperCase() + type.slice(1);
}

function getDisplayType(node) {
  if (!node) {
    return "";
  }

  if (Object.prototype.hasOwnProperty.call(node, "displayType") && node.displayType === null) {
    return "";
  }

  return hasDisplayValue(node.displayType) ? node.displayType : labelForType(node.type);
}

function hasDisplayValue(value) {
  return value !== null && value !== undefined && value !== "";
}

function hasNodePrimaryContent(node) {
  return Boolean(
    node &&
      (hasDisplayValue(node.title) ||
        hasDisplayValue(node.question) ||
        hasDisplayValue(node.details))
  );
}

function getTitleText(node, fallback) {
  if (!node) {
    return fallback;
  }

  if (Object.prototype.hasOwnProperty.call(node, "title") && node.title === null) {
    return "";
  }

  return hasDisplayValue(node.title) ? node.title : fallback;
}

function getDetailsText(node, fallback = "") {
  if (!node) {
    return fallback;
  }

  if (Object.prototype.hasOwnProperty.call(node, "details") && node.details === null) {
    return "";
  }

  if (hasDisplayValue(node.details)) {
    return node.details;
  }

  if (Object.prototype.hasOwnProperty.call(node, "description") && node.description === null) {
    return "";
  }

  return hasDisplayValue(node.description) ? node.description : fallback;
}

function getDetailsFallback(node) {
  return node?.type === "action" ? "" : "No details provided.";
}

function getNavigationTitleText(node, fallback) {
  if (!node) {
    return fallback;
  }

  const display = node.display || {};
  if (
    node.navigationTitle === null ||
    node.navTitle === null ||
    node.navigationName === null ||
    node.navName === null ||
    display.navigationTitle === null ||
    display.navTitle === null ||
    display.navigationName === null ||
    display.navName === null ||
    display.navigation?.title === null ||
    display.navigation?.name === null
  ) {
    return "";
  }

  return (
    firstDisplayValue(
      node.navigationTitle,
      node.navTitle,
      node.navigationName,
      node.navName,
      display.navigationTitle,
      display.navTitle,
      display.navigationName,
      display.navName,
      display.navigation?.title,
      display.navigation?.name
    ) || getTitleText(node, fallback)
  );
}

function firstDisplayValue(...values) {
  return values.find((value) => hasDisplayValue(value)) || "";
}

function getTooltipText(node) {
  if (!node) {
    return "";
  }

  if (Object.prototype.hasOwnProperty.call(node, "tooltip") && node.tooltip === null) {
    return "";
  }

  if (hasDisplayValue(node.tooltip)) {
    return node.tooltip;
  }

  return getDetailsText(node, getDetailsFallback(node));
}

function isCriticalNode(node) {
  return Boolean(node?.critical || node?.display?.critical);
}

function hidesResetControl(node) {
  const display = node?.display || {};
  return Boolean(
    node?.reset === false ||
      node?.showReset === false ||
      node?.hideReset ||
      display.reset === false ||
      display.showReset === false ||
      display.hideReset
  );
}

function showsInNavigation(node) {
  if (!node) {
    return true;
  }

  const display = node.display || {};
  return !(
    node.navigation === false ||
    node.showInNavigation === false ||
    node.hideFromNavigation ||
    display.navigation === false ||
    display.showInNavigation === false ||
    display.hideFromNavigation ||
    display.hideInNavigation ||
    display.hideFromNav ||
    display.navigation?.show === false
  );
}

function setChartZoom(nextScale) {
  const previousScale = chartZoom.scale;
  const next = Math.min(chartZoom.max, Math.max(chartZoom.min, nextScale));
  const viewport = elements.chartViewport.getBoundingClientRect();
  const centerX = viewport.width / 2;
  const centerY = viewport.height / 2;
  chartZoom.x = centerX - ((centerX - chartZoom.x) / previousScale) * next;
  chartZoom.y = centerY - ((centerY - chartZoom.y) / previousScale) * next;
  chartZoom.scale = next;
  applyChartTransform();
  elements.zoomLabel.textContent = `${Math.round(chartZoom.scale * 100)}%`;
}

function fitChartToViewport() {
  updateChartViewportSize();

  const viewportWidth = elements.chartViewport.clientWidth;
  const viewportHeight = elements.chartViewport.clientHeight;
  const dimensions = getChartContentDimensions();
  const treeWidth = dimensions.width;
  const treeHeight = dimensions.height;
  if (!viewportWidth || !viewportHeight || !treeWidth || !treeHeight) {
    chartZoom.scale = 1;
    chartZoom.x = 0;
    chartZoom.y = 0;
    applyChartTransform();
    return;
  }

  const scaleX = (viewportWidth - 32) / treeWidth;
  const scaleY = (viewportHeight - 32) / treeHeight;
  const fitScale = Math.min(scaleX, scaleY);
  if (isChartImageMode()) {
    chartZoom.min = Math.min(1, Math.max(0.01, fitScale));
    chartZoom.scale = chartZoom.min;
  } else {
    chartZoom.min = chartZoom.defaultMin;
    chartZoom.scale = Math.min(1, Math.max(chartZoom.min, fitScale));
  }
  chartZoom.x = (viewportWidth - treeWidth * chartZoom.scale) / 2;
  chartZoom.y = isChartImageMode()
    ? (viewportHeight - treeHeight * chartZoom.scale) / 2
    : Math.max(16, (viewportHeight - treeHeight * chartZoom.scale) / 2);
  applyChartTransform();
  elements.zoomLabel.textContent = `${Math.round(chartZoom.scale * 100)}%`;
}

function applyChartTransform() {
  const x = formatChartCoordinate(chartZoom.x);
  const y = formatChartCoordinate(chartZoom.y);

  if (isChartImageMode()) {
    updateChartImageScale();
    elements.chartCanvas.style.transform = `translate(${x}px, ${y}px)`;
    return;
  }

  elements.chartCanvas.style.transform = `translate(${x}px, ${y}px) scale(${formatChartCoordinate(chartZoom.scale)})`;
}

function formatChartCoordinate(value) {
  return Math.round(value * 1000) / 1000;
}

function isChartImageMode() {
  return elements.chartTree.classList.contains("is-image-mode");
}

function setImageCanvasDimensions(image) {
  if (!isChartImageMode() || !image) {
    return;
  }

  const width = image.naturalWidth || image.width || image.offsetWidth;
  const height = image.naturalHeight || image.height || image.offsetHeight;
  if (!width || !height) {
    return;
  }

  image.dataset.naturalWidth = String(width);
  image.dataset.naturalHeight = String(height);
  updateChartImageScale();
}

function updateChartImageScale() {
  const image = elements.chartTree.querySelector(".chart-image");
  if (!image) {
    return;
  }

  const dimensions = getChartImageNaturalDimensions(image);
  if (!dimensions.width || !dimensions.height) {
    return;
  }

  const renderedWidth = dimensions.width * chartZoom.scale;
  const renderedHeight = dimensions.height * chartZoom.scale;
  image.style.width = `${renderedWidth}px`;
  image.style.height = `${renderedHeight}px`;
  elements.chartTree.style.width = `${renderedWidth}px`;
  elements.chartTree.style.height = `${renderedHeight}px`;
}

function getChartImageNaturalDimensions(image = elements.chartTree.querySelector(".chart-image")) {
  if (!image) {
    return { width: 0, height: 0 };
  }

  return {
    width: Number(image.dataset.naturalWidth) || image.naturalWidth || image.width || image.offsetWidth,
    height: Number(image.dataset.naturalHeight) || image.naturalHeight || image.height || image.offsetHeight
  };
}

function getChartContentDimensions() {
  if (isChartImageMode()) {
    return getChartImageNaturalDimensions();
  }

  return {
    width: elements.chartTree.scrollWidth,
    height: elements.chartTree.scrollHeight
  };
}

function updateChartViewportSize() {
  const box = elements.chartViewport.getBoundingClientRect();
  const bottomPadding = 28;
  const availableHeight = window.innerHeight - box.top - bottomPadding;
  const nextHeight = Math.max(320, Math.min(760, availableHeight));
  elements.chartViewport.style.height = `${nextHeight}px`;
  if (!isChartImageMode()) {
    elements.detailPanel.style.setProperty("--chart-window-height", `${elements.chartMain.offsetHeight}px`);
  }
}

function startChartPan(event) {
  if (event.button !== 0 || event.target.closest("a")) {
    return;
  }

  chartZoom.isPanning = true;
  chartZoom.pointerId = event.pointerId;
  chartZoom.startX = event.clientX;
  chartZoom.startY = event.clientY;
  chartZoom.originX = chartZoom.x;
  chartZoom.originY = chartZoom.y;
  chartZoom.dragMoved = false;
  elements.chartViewport.classList.add("is-panning");
  elements.chartViewport.setPointerCapture(event.pointerId);
}

function moveChartPan(event) {
  if (!chartZoom.isPanning || chartZoom.pointerId !== event.pointerId) {
    return;
  }

  const deltaX = event.clientX - chartZoom.startX;
  const deltaY = event.clientY - chartZoom.startY;
  chartZoom.dragMoved = chartZoom.dragMoved || Math.abs(deltaX) > 4 || Math.abs(deltaY) > 4;
  chartZoom.x = chartZoom.originX + deltaX;
  chartZoom.y = chartZoom.originY + deltaY;
  applyChartTransform();
}

function endChartPan(event) {
  if (!chartZoom.isPanning || chartZoom.pointerId !== event.pointerId) {
    return;
  }

  chartZoom.isPanning = false;
  chartZoom.pointerId = null;
  elements.chartViewport.classList.remove("is-panning");

  if (chartZoom.dragMoved) {
    chartZoom.suppressClick = true;
    window.setTimeout(() => {
      chartZoom.suppressClick = false;
    }, 80);
  }
}

function handleChartViewerClick() {
  if (elements.chartPanel.classList.contains("is-hidden") || chartZoom.suppressClick || chartZoom.dragMoved) {
    return;
  }

  scrollChartViewerIntoView();
}

function scrollChartViewerIntoView() {
  const target = elements.chartMain;
  const box = target.getBoundingClientRect();
  const padding = 16;
  const fitsInViewport = box.height + padding * 2 <= window.innerHeight;
  const fullyVisible = box.top >= padding && box.bottom <= window.innerHeight - padding;

  if (fullyVisible) {
    return;
  }

  const scrollTop = window.scrollY + box.top - padding;
  const centeredScrollTop = window.scrollY + box.top - (window.innerHeight - box.height) / 2;
  window.scrollTo({
    top: fitsInViewport ? Math.max(0, centeredScrollTop) : Math.max(0, scrollTop),
    behavior: "smooth"
  });
}

function drawChartConnectors() {
  if (elements.chartTree.classList.contains("is-image-mode")) {
    elements.chartConnectors.innerHTML = "";
    return;
  }

  const svg = elements.chartConnectors;
  const width = elements.chartTree.scrollWidth;
  const height = elements.chartTree.scrollHeight;
  svg.innerHTML = `
    <defs>
      <marker id="connector-arrow" markerWidth="10" markerHeight="10" refX="8" refY="5" orient="auto">
        <path d="M 0 0 L 10 5 L 0 10 z" fill="var(--accent-strong)"></path>
      </marker>
    </defs>
  `;
  svg.setAttribute("width", width);
  svg.setAttribute("height", height);
  svg.setAttribute("viewBox", `0 0 ${width} ${height}`);

  document.querySelectorAll(".branch").forEach((branch) => {
    const branches = branch.closest(".branches");
    const parentCard = branches?.parentElement?.querySelector(":scope > .node-card");
    const targetCard = branch.querySelector(":scope > .tree-node > .node-card");
    if (!parentCard || !targetCard) {
      return;
    }

    const parentBox = getChartBox(parentCard);
    const targetBox = getChartBox(targetCard);
    const startX = parentBox.x + parentBox.width / 2;
    const startY = parentBox.y + parentBox.height;
    const endX = targetBox.x + targetBox.width / 2;
    const endY = targetBox.y;
    const midY = startY + Math.max(30, (endY - startY) / 2);
    const pathData = `M ${startX} ${startY} V ${midY} H ${endX} V ${endY - 8}`;

    const path = document.createElementNS("http://www.w3.org/2000/svg", "path");
    path.setAttribute("class", "flow-connector");
    path.setAttribute("d", pathData);
    path.setAttribute("marker-end", "url(#connector-arrow)");
    svg.append(path);
  });
}

function getChartBox(element) {
  let x = 0;
  let y = 0;
  let current = element;

  while (current && current !== elements.chartTree) {
    x += current.offsetLeft;
    y += current.offsetTop;
    current = current.offsetParent;
  }

  return {
    x,
    y,
    width: element.offsetWidth,
    height: element.offsetHeight
  };
}

function escapeHtml(value) {
  return String(value)
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#039;");
}

initialize();
