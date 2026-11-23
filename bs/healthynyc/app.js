// Renders Vega-Lite charts from the CSV into every [data-chart-set] element,
// using titles/subtitles/notes from charts.config.json.
const CONFIG_URL = 'charts.config.json';

const toNumber = (v) => {
  const n = parseFloat(String(v ?? '').replace(/,/g, ''));
  return Number.isFinite(n) ? n : null; // blank or "*" (suppressed) -> null
};

// Rows for one chart (or one view of it). Keeps the raw CSV text so the
// screen-reader table can tell "suppressed" (*) from "no data" (blank).
function chartData(chart, rows) {
  return rows
    .filter((r) => r.Indicator === chart.indicator && r.Units === chart.units &&
                   (!chart.groups || chart.groups.includes(r.Group)))
    .map((r) => ({ year: Number(r.Year), group: r.Group, value: toNumber(r.Value), raw: r.Value }));
}

const unitsLabel = (chart) => (chart.units === 'Deaths' ? 'Number of deaths' : chart.units);

// Reference lines can be fixed values or targets calculated from a
// specified baseline year/group (for example, a percent reduction from 2021).
function referenceValue(chart, data) {
  const ref = chart.referenceLine;
  if (!ref) return null;
  if (Number.isFinite(ref.value)) return ref.value;
  if (Number.isFinite(ref.baselineYear) && ref.baselineGroup && Number.isFinite(ref.reduction)) {
    const baseline = data.find((d) => d.year === ref.baselineYear &&
                               d.group === ref.baselineGroup && d.value !== null);
    if (baseline) return baseline.value * (1 - ref.reduction);
  }
  return null;
}

const formatNumber = (n) => n.toLocaleString('en-US', { maximumFractionDigits: 2 });

// Screen-reader table with the same data the chart draws. Line charts get one
// row per year and one column per group; bar charts get one row per group.
function buildTable(chart, rows) {
  const data = chartData(chart, rows);
  const units = unitsLabel(chart);
  const cellText = (d) => {
    if (d && d.value !== null) return formatNumber(d.value);
    return d && String(d.raw ?? '').trim() === '*' ? 'Not shown (too few to report reliably)' : 'No data';
  };
  const el = (tag, text, attrs = {}) => {
    const node = document.createElement(tag);
    if (text !== undefined) node.textContent = text;
    Object.entries(attrs).forEach(([k, v]) => node.setAttribute(k, v));
    return node;
  };

  const table = el('table');
  const refValue = referenceValue(chart, data);
  const captionParts = [chart.title, chart.subtitle, `Values: ${units}.`];
  if (Number.isFinite(refValue)) {
    captionParts.push(`The chart's dashed reference line is the ${chart.referenceLine.label || 'target'}: ${formatNumber(refValue)}.`);
    if (chart.referenceLine.annotation) captionParts.push(chart.referenceLine.annotation);
  }
  table.append(el('caption', captionParts.filter(Boolean).map((t) => String(t).trim()).join(' ')));

  const thead = el('thead');
  const headRow = el('tr');
  const tbody = el('tbody');

  if (chart.type === 'bar') {
    const d = data.filter((r) => String(r.year) === String(chart.year))
      .sort((a, b) => (b.value ?? -Infinity) - (a.value ?? -Infinity));
    headRow.append(el('th', 'Group', { scope: 'col' }), el('th', `${units}, ${chart.year}`, { scope: 'col' }));
    d.forEach((r) => {
      const tr = el('tr');
      tr.append(el('th', r.group, { scope: 'row' }), el('td', cellText(r)));
      tbody.append(tr);
    });
  } else {
    const present = new Set(data.map((d) => d.group));
    const groups = chart.groups ? chart.groups.filter((g) => present.has(g)) : [...present];
    const years = [...new Set(data.map((d) => d.year))].sort((a, b) => a - b);
    const lookup = new Map(data.map((d) => [`${d.group}|${d.year}`, d]));
    headRow.append(el('th', 'Year', { scope: 'col' }));
    groups.forEach((g) => headRow.append(el('th', g, { scope: 'col' })));
    years.forEach((y) => {
      const tr = el('tr');
      tr.append(el('th', String(y), { scope: 'row' }));
      groups.forEach((g) => tr.append(el('td', cellText(lookup.get(`${g}|${y}`)))));
      tbody.append(tr);
    });
  }
  thead.append(headRow);
  table.append(thead, tbody);
  return table;
}

function buildSpec(chart, rows, height, groupColors = {}, defaults = {}) {
  const data = chartData(chart, rows);
  const unitsTitle = unitsLabel(chart);
  const base = {
    $schema: 'https://vega.github.io/schema/vega-lite/v5.json',
    description: chart.alt || chart.title,
    width: 'container',
    height,
    autosize: { type: 'fit-x', contains: 'padding' },
    padding: { left: 0, right: 8, top: 8, bottom: 8 },
    // Legend removed: multi-series line charts are labeled directly at line ends.
    config: { font: 'inherit', axis: { labelFontSize: 12, titleFontSize: 12 }, view: { stroke: null } },
  };
  const multi = new Set(data.map((d) => d.group)).size > 1;

  // Direct-label placement: "labelPosition" is "end" (default) or "start",
  // set on a chart or view in charts.config.json, or in "defaults" for all charts.
  const labelPosition = [chart.labelPosition, defaults.labelPosition]
    .find((v) => v === 'start' || v === 'end') ?? 'end';
  const labelAtStart = multi && labelPosition === 'start';

  // Reserve room beside the plot for the labels: on the right for "end",
  // on the left for "start". With autosize 'fit-x' + contains 'padding',
  // the plot area shrinks to fit this padding.
  // Manual override (pixels): "labelPadding" on a chart or view, or in
  // "defaults". Otherwise it is estimated from the longest group name.
  if (multi) {
    const manual = [chart.labelPadding, defaults.labelPadding].find(Number.isFinite);
    const longest = Math.max(...data.map((d) => String(d.group).length));
    const auto = Math.min(220, longest * 7 + 16);
    base.padding = { ...base.padding, [labelAtStart ? 'left' : 'right']: manual ?? auto };
  }

  const referenceLineValue = referenceValue(chart, data);

  if (chart.type === 'bar') {
    const d = data.filter((r) => String(r.year) === String(chart.year))
      .sort((a, b) => (b.value ?? -Infinity) - (a.value ?? -Infinity));
    headRow.append(el('th', 'Group', { scope: 'col' }), el('th', `${units}, ${chart.year}`, { scope: 'col' }));
    d.forEach((r) => {
      const tr = el('tr');
      tr.append(el('th', r.group, { scope: 'row' }), el('td', cellText(r)));
      tbody.append(tr);
    });
  } else {
    const present = new Set(data.map((d) => d.group));
    const groups = chart.groups ? chart.groups.filter((g) => present.has(g)) : [...present];
    const years = [...new Set(data.map((d) => d.year))].sort((a, b) => a - b);
    const lookup = new Map(data.map((d) => [`${d.group}|${d.year}`, d]));
    headRow.append(el('th', 'Year', { scope: 'col' }));
    groups.forEach((g) => headRow.append(el('th', g, { scope: 'col' })));
    years.forEach((y) => {
      const tr = el('tr');
      tr.append(el('th', String(y), { scope: 'row' }));
      groups.forEach((g) => tr.append(el('td', cellText(lookup.get(`${g}|${y}`)))));
      tbody.append(tr);
    });
  }
  thead.append(headRow);
  table.append(thead, tbody);
  return table;
}

function buildSpec(chart, rows, height, groupColors = {}, defaults = {}) {
  const data = chartData(chart, rows);
  const unitsTitle = unitsLabel(chart);
  const base = {
    $schema: 'https://vega.github.io/schema/vega-lite/v5.json',
    description: chart.alt || chart.title,
    width: 'container',
    height,
    autosize: { type: 'fit-x', contains: 'padding' },
    padding: { left: 0, right: 8, top: 8, bottom: 8 },
    // Legend removed: multi-series line charts are labeled directly at line ends.
    config: { font: 'inherit', axis: { labelFontSize: 12, titleFontSize: 12 }, view: { stroke: null } },
  };
  const multi = new Set(data.map((d) => d.group)).size > 1;

  // Direct-label placement: "labelPosition" is "end" (default) or "start",
  // set on a chart or view in charts.config.json, or in "defaults" for all charts.
  const labelPosition = [chart.labelPosition, defaults.labelPosition]
    .find((v) => v === 'start' || v === 'end') ?? 'end';
  const labelAtStart = multi && labelPosition === 'start';

  // Reserve room beside the plot for the labels: on the right for "end",
  // on the left for "start". With autosize 'fit-x' + contains 'padding',
  // the plot area shrinks to fit this padding.
  // Manual override (pixels): "labelPadding" on a chart or view, or in
  // "defaults". Otherwise it is estimated from the longest group name.
  if (multi) {
    const manual = [chart.labelPadding, defaults.labelPadding].find(Number.isFinite);
    const longest = Math.max(...data.map((d) => String(d.group).length));
    const auto = Math.min(220, longest * 7 + 16);
    base.padding = { ...base.padding, [labelAtStart ? 'left' : 'right']: manual ?? auto };
  }

  // Reference lines can be fixed values or targets calculated from a
  // specified baseline year/group (for example, a percent reduction from 2021).
  let referenceLineValue = null;
  if (chart.referenceLine) {
    const ref = chart.referenceLine;
    if (Number.isFinite(ref.value)) {
      referenceLineValue = ref.value;
    } else if (Number.isFinite(ref.baselineYear) && ref.baselineGroup &&
               Number.isFinite(ref.reduction)) {
      const baseline = data.find((d) => d.year === ref.baselineYear &&
                                 d.group === ref.baselineGroup && d.value !== null);
      if (baseline) referenceLineValue = baseline.value * (1 - ref.reduction);
    }
  }

  if (chart.type === 'bar') {
    const d = data.filter((r) => String(r.year) === String(chart.year) && r.value !== null);
    const order = [...d].sort((a, b) => b.value - a.value).map((r) => r.group);
    return { ...base, data: { values: d }, height: Math.max(120, 40 * d.length),
      encoding: { y: { field: 'group', type: 'nominal', sort: order, title: null, axis: { labelLimit: 200 } },
                  x: { field: 'value', type: 'quantitative', title: unitsTitle } },
      layer: [{ mark: 'bar' },
              { mark: { type: 'text', align: 'left', dx: 4 }, encoding: { text: { field: 'value', type: 'quantitative', format: ',.1~f' } } }] };
  }
  const finiteValues = data.map((d) => d.value).filter(Number.isFinite);
  const domainCandidates = [...finiteValues];
  if (referenceLineValue !== null && Number.isFinite(referenceLineValue)) domainCandidates.push(referenceLineValue);
  const dataMin = domainCandidates.length ? Math.min(...domainCandidates) : 0;
  const dataMax = domainCandidates.length ? Math.max(...domainCandidates) : 1;
  const yDomainMin = dataMin - Math.max((dataMax - dataMin) * 0.08, Math.abs(dataMin) * 0.02, 0.1);

  const sharedEncoding = {
    x: {
      field: 'year',
      type: 'quantitative',
      title: null,
      scale: { domain: [2015, 2030], nice: false },
      axis: { values: [2015, 2020, 2025, 2030], format: 'd', labelAngle: 0, grid: false },
    },
    y: {
      field: 'value',
      type: 'quantitative',
      title: null,
      scale: { zero: false, domainMin: yDomainMin },
      axis: { tickCount: 4, title: null, grid: true, labelLimit: 1000, minExtent: 50, labelFlush: false,
              // Start labels occupy the left side, so the y axis moves to the right.
             orient: 'right' },
    },
    ...(multi ? {
      color: {
        field: 'group',
        type: 'nominal',
        title: null,
        // Use the groups present in this view. Sex-specific cancer groups
        // inherit the color of their race/ethnicity (e.g. "Black female"
        // uses the same color as "Black").
        scale: {
          domain: [...new Set(data.map((d) => d.group))],
          range: [...new Set(data.map((d) => d.group))].map((group) =>
            groupColors[group] ||
            groupColors[group.replace(/ (female|male)$/i, '')] ||
            '#777777'
          ),
        },
        legend: null,
      },
    } : {}),
  };
  const layers = [
      {
        mark: { type: 'line', strokeWidth: 2 },
        encoding: sharedEncoding,
      },
      {
        // Keep the hover selection scoped to this point layer. Declaring it
        // on the layered chart can cause Vega to generate duplicate signals.
        params: [{
          name: 'pointHover',
          select: { type: 'point', fields: ['year', 'group'], on: 'pointerover', clear: 'pointerout' },
        }],
        mark: { type: 'point', filled: true },
        encoding: {
          ...sharedEncoding,
          size: {
            condition: { param: 'pointHover', value: 130 },
            value: 45,
          },
          tooltip: [
            { field: 'group', type: 'nominal', title: 'Group' },
            { field: 'year', type: 'quantitative', title: 'Year', format: 'd' },
            { field: 'value', type: 'quantitative', title: unitsTitle, format: ',' },
          ],
        },
      },
  ];

  // Direct labels at the first or last value of each line (replaces the legend).
  if (multi) {
    layers.push({
      // Drop suppressed/blank values first so "first"/"last" means a real data point.
      transform: [
        { filter: 'isValid(datum.value)' },
        { joinaggregate: [{ op: labelAtStart ? 'min' : 'max', field: 'year', as: 'edgeYear' }], groupby: ['group'] },
        { filter: 'datum.year === datum.edgeYear' },
      ],
      mark: { type: 'text', align: labelAtStart ? 'right' : 'left', baseline: 'middle', dx: labelAtStart ? -8 : 8, fontSize: 12, fontWeight: 'bold' },
      encoding: {
        x: sharedEncoding.x,
        y: sharedEncoding.y,
        color: sharedEncoding.color,
        text: { field: 'group', type: 'nominal' },
        // Labels are visible by default. While a series is hovered (see
        // activeGroup, set in createChart), only that series' label shows.
        opacity: { condition: { test: 'activeGroup === null || datum.group === activeGroup', value: 1 }, value: 0 },
      },
    });
  }

  if (referenceLineValue !== null && Number.isFinite(referenceLineValue)) {
    layers.push({
      data: { values: [{ target: referenceLineValue }] },
      mark: { type: 'rule', color: '#555', strokeDash: [6, 4], strokeWidth: 2 },
      encoding: {
        x: { datum: 2021, type: 'quantitative' },
        x2: { datum: 2030 },
        y: { field: 'target', type: 'quantitative' },
        tooltip: [{ field: 'target', type: 'quantitative', title: chart.referenceLine.label || 'Target', format: ',.1~f' }],
      },
    });
    if (chart.referenceLine.annotation) {
      layers.push({
        data: { values: [{ target: referenceLineValue, label: chart.referenceLine.annotation }] },
        mark: { type: 'text', align: 'right', baseline: 'bottom', dx: -6, dy: -6, fontSize: 11, color: '#444' },
        encoding: {
          x: { datum: 2030, type: 'quantitative' },
          y: { field: 'target', type: 'quantitative' },
          text: { field: 'label' },
        },
      });
    }
  }
  // activeGroup: the series currently under the pointer (null = none).
  // Only multi-series charts have end labels, so only they need it.
  return { ...base, ...(multi ? { params: [{ name: 'activeGroup', value: null }] } : {}),
           data: { values: data }, layer: layers };
}

function createChart(setKey, chart, defaults, rows) {
  const wrap = document.createElement('div');
  const fig = document.createElement('figure');
  fig.className = 'chart';
  fig.id = `chart-${setKey}-${chart.id}`;
  const cap = document.createElement('figcaption');
  cap.setAttribute('aria-live', 'polite');
  const title = document.createElement('strong');
  title.className = 'chart-title';
  const sub = document.createElement('span');
  sub.className = 'chart-subtitle';
  cap.append(title, sub);
  const body = document.createElement('div');
  body.className = 'chart-body';
  const annotation = document.createElement('p');
  annotation.className = 'chart-annotation';
  const note = document.createElement('p');
  note.className = 'chart-note';
  const small = document.createElement('small');
  note.append(small);
  // The visualization is hidden from assistive technology; this table
  // (visually hidden, same data) is what screen readers get instead.
  body.setAttribute('aria-hidden', 'true');
  const srTable = document.createElement('div');
  srTable.className = 'sr-only';
  fig.append(cap, body, srTable, annotation, note);

  let embedded = null;
  async function show(c) {
    title.textContent = c.title;
    sub.textContent = c.subtitle || '';
    sub.hidden = !c.subtitle;
    // annotation.textContent = c.annotation || '';
    // annotation.hidden = !annotation.textContent;
    small.textContent = c.note ?? defaults.note ?? '';
    note.hidden = !small.textContent;
    if (embedded) embedded.finalize();
    srTable.replaceChildren(buildTable(c, rows));
    body.setAttribute('aria-hidden', 'true');
    try {
      embedded = await vegaEmbed(body, buildSpec(c, rows, defaults.height, defaults.groupColors || {}, defaults), { actions: false, renderer: 'svg' });
      // Hovering a line, a point or a label sets activeGroup, which hides the
      // other series' labels. Leaving the mark restores all labels.
      const view = embedded.view;
      let hasActiveGroup = Boolean(view);
      try { view.signal('activeGroup'); } catch { hasActiveGroup = false; } // single-series charts
      if (hasActiveGroup) {
        const setActive = (g) => { if (view.signal('activeGroup') !== g) view.signal('activeGroup', g).run(); };
        view.addEventListener('pointerover', (event, item) => setActive(item?.datum?.group ?? null));
        view.addEventListener('pointerout', () => setActive(null));
      }
    } catch (e) {
      body.removeAttribute('aria-hidden'); // so the error message is announced
      body.textContent = 'This chart could not be displayed.';
      console.error(setKey, c.id, e);
    }
  }

  if (chart.views?.length) {
    const group = document.createElement('div');
    group.className = 'chart-views';
    group.setAttribute('role', 'group');
    group.setAttribute('aria-label', chart.viewsLabel || (chart.indicator ? `${chart.indicator}: chart view` : 'Chart view'));
    const buttons = chart.views.map((view, i) => {
      const b = document.createElement('button');
      b.type = 'button';
      b.textContent = view.label;
      b.setAttribute('aria-controls', fig.id);
      b.setAttribute('aria-pressed', String(i === 0));
      b.addEventListener('click', () => {
        buttons.forEach((o) => o.setAttribute('aria-pressed', String(o === b)));
        show({ ...chart, ...view });
      });
      return b;
    });
    group.append(...buttons);
    wrap.append(group, fig);
    show({ ...chart, ...chart.views[0] });
  } else {
    wrap.append(fig);
    show(chart);
  }
  return wrap;
}

async function main() {
  const config = await (await fetch(CONFIG_URL)).json();
  const defaults = config.defaults;
  const csv = await (await fetch(defaults.dataUrl)).text();
  const rows = vega.read(csv, { type: 'csv' }); // all values stay strings; we parse ourselves

  for (const el of document.querySelectorAll('[data-chart-set]')) {
    const key = el.dataset.chartSet;
    const set = config.sets[key];
    if (!set) { el.textContent = `No chart config for set "${key}".`; continue; }
    for (const c of set.charts) {
      el.append(createChart(key, { indicator: set.indicator, ...c }, defaults, rows));
    }
  }
}
main().catch((e) => console.error(e));