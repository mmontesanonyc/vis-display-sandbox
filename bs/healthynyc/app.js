// Renders Vega-Lite charts from the CSV into every [data-chart-set] element,
// using titles/subtitles/notes from charts.config.json.
const CONFIG_URL = 'charts.config.json';

const toNumber = (v) => {
  const n = parseFloat(String(v ?? '').replace(/,/g, ''));
  return Number.isFinite(n) ? n : null; // blank or "*" (suppressed) -> null
};

function buildSpec(chart, rows, height) {
  const data = rows
    .filter((r) => r.Indicator === chart.indicator && r.Units === chart.units &&
                   (!chart.groups || chart.groups.includes(r.Group)))
    .map((r) => ({ year: Number(r.Year), group: r.Group, value: toNumber(r.Value) }));
  const unitsTitle = chart.units === 'Deaths' ? 'Number of deaths' : chart.units;
  const base = {
    $schema: 'https://vega.github.io/schema/vega-lite/v5.json',
    description: chart.alt || chart.title,
    width: 'container',
    height,
    autosize: { type: 'fit-x', contains: 'padding' },
    config: { font: 'inherit', axis: { labelFontSize: 12, titleFontSize: 12 } },
  };
  const multi = new Set(data.map((d) => d.group)).size > 1;

  if (chart.type === 'bar') {
    const d = data.filter((r) => String(r.year) === String(chart.year) && r.value !== null);
    const order = [...d].sort((a, b) => b.value - a.value).map((r) => r.group);
    return { ...base, data: { values: d }, height: Math.max(120, 40 * d.length),
      encoding: { y: { field: 'group', type: 'nominal', sort: order, title: null, axis: { labelLimit: 200 } },
                  x: { field: 'value', type: 'quantitative', title: unitsTitle } },
      layer: [{ mark: 'bar' },
              { mark: { type: 'text', align: 'left', dx: 4 }, encoding: { text: { field: 'value', type: 'quantitative', format: ',.1~f' } } }] };
  }
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
      scale: { zero: false },
      axis: { tickCount: 4, title: null, grid: true },
    },
    ...(multi ? { color: { field: 'group', type: 'nominal', title: null } } : {}),
  };
  return {
    ...base,
    data: { values: data },
    layer: [
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
    ],
  };
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
  const note = document.createElement('p');
  note.className = 'chart-note';
  const small = document.createElement('small');
  note.append(small);
  fig.append(cap, body, note);

  let embedded = null;
  async function show(c) {
    title.textContent = c.title;
    sub.textContent = c.subtitle || '';
    sub.hidden = !c.subtitle;
    small.textContent = c.note ?? defaults.note ?? '';
    note.hidden = !small.textContent;
    if (embedded) embedded.finalize();
    try {
      embedded = await vegaEmbed(body, buildSpec(c, rows, defaults.height), { actions: false, renderer: 'svg' });
    } catch (e) {
      body.textContent = 'This chart could not be displayed.';
      console.error(setKey, c.id, e);
    }
  }

  if (chart.views?.length) {
    const group = document.createElement('div');
    group.className = 'chart-views';
    group.setAttribute('role', 'group');
    group.setAttribute('aria-label', `${chart.viewsLabel || 'Chart view'}`);
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
