const { useState, useRef, useMemo, useEffect } = React;
const { toPng } = htmlToImage;

// --- utils ---
const clamp = (v, a, b) => Math.max(a, Math.min(b, v));
const uid = () => Math.random().toString(36).slice(2, 9);

// Panel layout presets
const LAYOUTS = {
  '1': { name: '1 Panel', grid: 'grid-cols-1', panels: 1 },
  '2h': { name: '2 Panels (Horizontal)', grid: 'md:grid-cols-2', panels: 2 },
  '2v': { name: '2 Panels (Vertical)', grid: 'grid-cols-1', panels: 2, vertical: true },
  '4': { name: '4 Panels (2x2)', grid: 'md:grid-cols-2', panels: 4 },
};

const DEFAULT_PAGE = () => ({
  layout: '4',
  panels: Array.from({ length: 4 }, () => ({
    id: uid(),
    bg: '#ffffff',
    elements: [],
  }))
});

const defaultText = (subtype) => ({
  id: uid(),
  type: 'text',
  subtype, // 'speech' | 'caption' | 'sfx'
  text: subtype === 'sfx' ? 'BAM!' : (subtype === 'caption' ? 'Caption...' : 'Speech...'),
  x: 24, y: 24, w: 200, h: 80,
  fontSize: subtype === 'sfx' ? 36 : 20,
  color: subtype === 'caption' ? '#111827' : '#111827',
  bg: subtype === 'caption' ? '#fef3c7' : '#ffffffcc',
  rotate: 0,
  z: 1,
  align: 'left',
  radius: subtype === 'speech' ? 16 : 8,
  weight: subtype === 'sfx' ? 800 : 600,
});

const defaultImage = (src, natural) => ({
  id: uid(),
  type: 'image',
  src,
  x: 24, y: 24,
  w: Math.min(300, natural?.width || 300),
  h: Math.min(220, natural?.height || 220),
  z: 0,
  rotate: 0,
});

// --- App ---
function App() {
  const [page, setPage] = useState(DEFAULT_PAGE);
  const [selection, setSelection] = useState({ panelIdx: 0, elId: null });
  const boardRef = useRef(null);

  // Keep panels array length in sync with layout preset
  useEffect(() => {
    const need = LAYOUTS[page.layout].panels;
    setPage(p => {
      let panels = p.panels.slice(0, need);
      while (panels.length < need) panels.push({ id: uid(), bg: '#ffffff', elements: [] });
      return { ...p, panels };
    });
  }, [page.layout]);

  const setPanel = (idx, patch) => {
    setPage(p => {
      const panels = p.panels.map((pan, i) => i === idx ? { ...pan, ...patch } : pan);
      return { ...p, panels };
    });
  };

  const mutateElement = (panelIdx, elId, patch) => {
    setPage(p => {
      const panels = p.panels.map((pan, i) => {
        if (i !== panelIdx) return pan;
        const elements = pan.elements.map(el => el.id === elId ? { ...el, ...patch } : el);
        return { ...pan, elements };
      });
      return { ...p, panels };
    });
  };

  const addText = (panelIdx, subtype) => {
    setPanel(panelIdx, { elements: [...page.panels[panelIdx].elements, defaultText(subtype)] });
  };

  const addImage = async (panelIdx, file) => {
    if (!file) return;
    const url = URL.createObjectURL(file);
    // Try to probe natural size
    const probe = await new Promise(res => {
      const img = new Image();
      img.onload = () => res({ width: img.naturalWidth, height: img.naturalHeight });
      img.onerror = () => res(null);
      img.src = url;
    });
    setPanel(panelIdx, { elements: [...page.panels[panelIdx].elements, defaultImage(url, probe)] });
  };

  const removeElement = (panelIdx, elId) => {
    setPage(p => {
      const panels = p.panels.map((pan, i) => {
        if (i !== panelIdx) return pan;
        return { ...pan, elements: pan.elements.filter(el => el.id !== elId) };
      });
      return { ...p, panels };
    });
    setSelection(s => ({ ...s, elId: null }));
  };

  // Export PNG and bump dashboard count
  const exportPNG = async () => {
    if (!boardRef.current) return;
    try {
      const dataUrl = await toPng(boardRef.current, {
        pixelRatio: 2,
        cacheBust: true,
        backgroundColor: '#ffffff'
      });
      const a = document.createElement('a');
      a.href = dataUrl;
      a.download = `comic-${Date.now()}.png`;
      a.click();
      const n = Number(localStorage.getItem('comicsCount') || '0') + 1;
      localStorage.setItem('comicsCount', String(n));
      alert('Exported PNG and updated dashboard count.');
    } catch (e) {
      console.error(e);
      alert('Export failed. (CORS or memory). Try smaller images.');
    }
  };

  // Save / Load JSON
  const saveJSON = () => {
    const blob = new Blob([JSON.stringify(page)], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url; a.download = 'comic.json'; a.click();
  };

  const loadJSON = (file) => {
    if (!file) return;
    const reader = new FileReader();
    reader.onload = () => {
      try {
        const doc = JSON.parse(reader.result);
        if (!doc || !Array.isArray(doc.panels)) throw new Error('Invalid format');
        setPage({
          layout: doc.layout in LAYOUTS ? doc.layout : '4',
          panels: doc.panels.map(p => ({
            id: p.id || uid(),
            bg: p.bg || '#ffffff',
            elements: Array.isArray(p.elements) ? p.elements.map(sanitizeElement) : []
          }))
        });
      } catch (e) {
        alert('Invalid JSON.');
      }
    };
    reader.readAsText(file);
  };

  const sanitizeElement = (el) => {
    if (el.type === 'image') {
      return {
        ...defaultImage(el.src || '', { width: el.w, height: el.h }),
        x: clamp(el.x ?? 24, 0, 10_000),
        y: clamp(el.y ?? 24, 0, 10_000),
        w: clamp(el.w ?? 300, 10, 10_000),
        h: clamp(el.h ?? 220, 10, 10_000),
        z: el.z ?? 0,
        rotate: el.rotate ?? 0
      };
    }
    // text
    const subtype = ['speech', 'caption', 'sfx'].includes(el.subtype) ? el.subtype : 'speech';
    return {
      ...defaultText(subtype),
      text: String(el.text ?? '').slice(0, 2000),
      x: clamp(el.x ?? 24, 0, 10_000),
      y: clamp(el.y ?? 24, 0, 10_000),
      w: clamp(el.w ?? 200, 40, 10_000),
      h: clamp(el.h ?? 80, 30, 10_000),
      fontSize: clamp(el.fontSize ?? 20, 8, 160),
      color: el.color || '#111827',
      bg: el.bg || (subtype === 'caption' ? '#fef3c7' : '#ffffffcc'),
      rotate: el.rotate ?? 0,
      z: el.z ?? 1,
      align: ['left','center','right'].includes(el.align) ? el.align : 'left',
      radius: clamp(el.radius ?? (subtype === 'speech' ? 16 : 8), 0, 64),
      weight: clamp(el.weight ?? (subtype === 'sfx' ? 800 : 600), 100, 900),
    };
  };

  // Keyboard: delete and nudge
  useEffect(() => {
    const onKey = (e) => {
      if (!document.activeElement || document.activeElement.tagName === 'INPUT' || document.activeElement.tagName === 'TEXTAREA') return;
      const { panelIdx, elId } = selection;
      if (elId == null) return;
      const step = e.shiftKey ? 10 : 1;
      if (e.key === 'Delete' || e.key === 'Backspace') {
        e.preventDefault();
        removeElement(panelIdx, elId);
      } else if (['ArrowUp','ArrowDown','ArrowLeft','ArrowRight'].includes(e.key)) {
        e.preventDefault();
        const el = page.panels[panelIdx]?.elements.find(x => x.id === elId);
        if (!el) return;
        const dx = (e.key === 'ArrowRight') ? step : (e.key === 'ArrowLeft' ? -step : 0);
        const dy = (e.key === 'ArrowDown') ? step : (e.key === 'ArrowUp' ? -step : 0);
        mutateElement(panelIdx, elId, { x: el.x + dx, y: el.y + dy });
      } else if (e.key === ']') {
        e.preventDefault();
        const el = page.panels[panelIdx]?.elements.find(x => x.id === elId);
        if (el) mutateElement(panelIdx, elId, { z: (el.z ?? 0) + 1 });
      } else if (e.key === '[') {
        e.preventDefault();
        const el = page.panels[panelIdx]?.elements.find(x => x.id === elId);
        if (el) mutateElement(panelIdx, elId, { z: Math.max(0, (el.z ?? 0) - 1) });
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [selection, page]);

  // Render
  return (
    <div className="min-h-screen grid grid-rows-[auto,1fr]">
      <Header
        page={page}
        onLayout={(layout) => setPage(p => ({ ...p, layout }))}
        onExport={exportPNG}
        onSave={saveJSON}
        onLoad={loadJSON}
      />

      <div className="grid md:grid-cols-[1fr,320px] gap-3 p-3">
        <Board
          ref={boardRef}
          page={page}
          selection={selection}
          setSelection={setSelection}
          setPanel={setPanel}
          mutateElement={mutateElement}
          addText={addText}
          addImage={addImage}
        />
        <Inspector
          page={page}
          selection={selection}
          mutateElement={mutateElement}
          removeElement={removeElement}
          setPanel={setPanel}
        />
      </div>
    </div>
  );
}

// --- Header ---
function Header({ page, onLayout, onExport, onSave, onLoad }) {
  const fileJSON = useRef(null);
  return (
    <header className="bg-white border-b">
      <div className="mx-auto max-w-7xl px-3 py-3 flex flex-wrap items-center gap-2">
        <a href="dashboard.html" className="text-slate-700 hover:underline font-semibold">Dashboard</a>
        <div className="grow" />
        <div className="flex items-center gap-2">
          <select
            className="border rounded px-2 py-1"
            value={page.layout}
            onChange={(e) => onLayout(e.target.value)}
            title="Panel layout"
          >
            {Object.entries(LAYOUTS).map(([k, v]) => (
              <option key={k} value={k}>{v.name}</option>
            ))}
          </select>

          <button className="px-3 py-1 rounded bg-slate-800 text-white" onClick={onExport} aria-label="Export PNG">Export PNG</button>
          <button className="px-3 py-1 rounded border" onClick={onSave} aria-label="Save JSON">Save</button>

          <input
            ref={fileJSON}
            type="file"
            accept="application/json"
            className="hidden"
            onChange={(e) => onLoad(e.target.files?.[0] || null)}
          />
          <button className="px-3 py-1 rounded border" onClick={() => fileJSON.current?.click()} aria-label="Load JSON">Load</button>
        </div>
      </div>
    </header>
  );
}

// --- Board / Panels ---
const Board = React.forwardRef(function Board(
  { page, selection, setSelection, setPanel, mutateElement, addText, addImage },
  ref
) {
  const layout = LAYOUTS[page.layout];
  const gridClasses = [
    'grid gap-3 bg-slate-200 p-3 rounded',
    layout.grid || 'grid-cols-1',
    layout.vertical ? 'grid-rows-2' : '',
    page.layout === '4' ? 'grid-cols-1 md:grid-cols-2' : ''
  ].join(' ');

  return (
    <main className="min-h-[70vh]">
      <div ref={ref} id="board" className={gridClasses}>
        {page.panels.map((panel, i) => (
          <Panel
            key={panel.id}
            idx={i}
            panel={panel}
            selectedElId={selection.panelIdx === i ? selection.elId : null}
            onSelect={(elId) => setSelection({ panelIdx: i, elId })}
            setPanel={setPanel}
            mutateElement={mutateElement}
            addText={addText}
            addImage={addImage}
          />
        ))}
      </div>
    </main>
  );
});

function Panel({ idx, panel, selectedElId, onSelect, setPanel, mutateElement, addText, addImage }) {
  const hostRef = useRef(null);
  const fileRef = useRef(null);

  // Drag & simple resize (corner handle). Transient state in refs; commit on move.
  const dragRef = useRef(null); // { id, kind: 'move'|'resize', startX, startY, startRect }

  useEffect(() => {
    const move = (e) => {
      if (!dragRef.current) return;
      e.preventDefault();
      const { id, kind, startX, startY, startRect } = dragRef.current;
      const dx = e.clientX - startX;
      const dy = e.clientY - startY;
      if (kind === 'move') {
        mutateElement(idx, id, { x: startRect.x + dx, y: startRect.y + dy });
      } else { // resize
        mutateElement(idx, id, { w: Math.max(20, startRect.w + dx), h: Math.max(20, startRect.h + dy) });
      }
    };
    const up = () => (dragRef.current = null);
    window.addEventListener('pointermove', move);
    window.addEventListener('pointerup', up);
    return () => {
      window.removeEventListener('pointermove', move);
      window.removeEventListener('pointerup', up);
    };
  }, [idx, mutateElement]);

  const startDrag = (e, el, kind) => {
    e.stopPropagation();
    onSelect(el.id);
    dragRef.current = {
      id: el.id,
      kind,
      startX: e.clientX,
      startY: e.clientY,
      startRect: { x: el.x, y: el.y, w: el.w, h: el.h }
    };
  };

  return (
    <section className="bg-white rounded shadow relative">
      <div className="absolute right-2 top-2 z-[100] flex gap-1">
        <button
          className="text-xs px-2 py-1 rounded bg-slate-900 text-white"
          onClick={() => addText(idx, 'speech')}
        >+ Speech</button>
        <button className="text-xs px-2 py-1 rounded bg-yellow-200" onClick={() => addText(idx, 'caption')}>+ Caption</button>
        <button className="text-xs px-2 py-1 rounded bg-pink-200" onClick={() => addText(idx, 'sfx')}>+ SFX</button>
        <input
          ref={fileRef}
          type="file"
          className="hidden"
          accept="image/*"
          onChange={(e) => addImage(idx, e.target.files?.[0] || null)}
        />
        <button className="text-xs px-2 py-1 rounded border" onClick={() => fileRef.current?.click()}>+ Image</button>
      </div>

      <div
        ref={hostRef}
        className="relative min-h-[360px] aspect-[4/3] overflow-hidden rounded"
        style={{ background: panel.bg }}
        onPointerDown={() => onSelect(null)}
      >
        {panel.elements.map((el) => (
          <ElementView
            key={el.id}
            el={el}
            selected={selectedElId === el.id}
            onPointerDown={(e) => startDrag(e, el, 'move')}
            onResizeStart={(e) => startDrag(e, el, 'resize')}
          />
        ))}
      </div>
    </section>
  );
}

function ElementView({ el, selected, onPointerDown, onResizeStart }) {
  const common = {
    position: 'absolute',
    left: el.x,
    top: el.y,
    width: el.w,
    height: el.h,
    transform: `rotate(${el.rotate || 0}deg)`,
    zIndex: el.z || 0,
  };

  if (el.type === 'image') {
    return (
      <div
        style={common}
        className={`group ${selected ? 'ring-2 ring-sky-500' : 'ring-1 ring-slate-300'} rounded cursor-move`}
        onPointerDown={onPointerDown}
      >
        <img src={el.src} alt="" className="w-full h-full object-cover rounded" />
        {selected && <div className="handle" onPointerDown={onResizeStart} />}
      </div>
    );
  }

  // text
  const align = el.align || 'left';
  const weight = el.weight || 600;
  return (
    <div
      style={common}
      className={`group ${selected ? 'ring-2 ring-sky-500' : 'ring-1 ring-slate-300'} rounded cursor-move p-2`}
      onPointerDown={onPointerDown}
    >
      <div
        className="w-full h-full flex items-center justify-start"
        style={{
          background: el.bg || '#ffffffcc',
          color: el.color || '#111827',
          borderRadius: (el.radius ?? 12) + 'px',
          fontSize: (el.fontSize || 18) + 'px',
          fontWeight: weight,
          textAlign: align
        }}
      >
        <div className="w-full">{el.text}</div>
      </div>
      {selected && <div className="handle" onPointerDown={onResizeStart} />}
    </div>
  );
}

// --- Inspector ---
function Inspector({ page, selection, mutateElement, removeElement, setPanel }) {
  const { panelIdx, elId } = selection;
  const panel = page.panels[panelIdx];
  const el = panel?.elements.find(e => e.id === elId);

  // panel background
  const panelBg = panel?.bg || '#ffffff';

  return (
    <aside className="bg-white rounded shadow p-3 h-min">
      <h2 className="font-semibold mb-2">Inspector</h2>

      <div className="mb-4">
        <label className="text-sm block mb-1">Panel background</label>
        <input
          type="color"
          value={panelBg}
          onChange={(e) => setPanel(panelIdx, { bg: e.target.value })}
        />
      </div>

      {!el && <p className="text-sm text-slate-600">Select an element to edit its properties.</p>}

      {el && (
        <div className="space-y-3">
          <div className="flex items-center justify-between">
            <span className="text-sm font-medium capitalize">{el.type}{el.subtype ? ` · ${el.subtype}` : ''}</span>
            <button className="text-red-600 text-sm underline" onClick={() => removeElement(panelIdx, el.id)}>Delete</button>
          </div>

          {el.type === 'text' && (
            <>
              <div>
                <label className="text-sm block mb-1">Text</label>
                <textarea
                  className="w-full border rounded p-2 text-sm"
                  rows={3}
                  value={el.text}
                  onChange={(e) => mutateElement(panelIdx, el.id, { text: e.target.value })}
                />
              </div>
              <div className="grid grid-cols-2 gap-2">
                <div>
                  <label className="text-sm block mb-1">Font size</label>
                  <input
                    type="number" className="w-full border rounded p-1"
                    value={el.fontSize}
                    onChange={(e) => mutateElement(panelIdx, el.id, { fontSize: Number(e.target.value || 0) })}
                  />
                </div>
                <div>
                  <label className="text-sm block mb-1">Weight</label>
                  <input
                    type="number" className="w-full border rounded p-1"
                    min="100" max="900" step="100"
                    value={el.weight ?? 600}
                    onChange={(e) => mutateElement(panelIdx, el.id, { weight: Number(e.target.value || 600) })}
                  />
                </div>
                <div>
                  <label className="text-sm block mb-1">Text color</label>
                  <input
                    type="color"
                    value={el.color || '#111827'}
                    onChange={(e) => mutateElement(panelIdx, el.id, { color: e.target.value })}
                  />
                </div>
                <div>
                  <label className="text-sm block mb-1">Background</label>
                  <input
                    type="color"
                    value={el.bg || '#ffffffcc'}
                    onChange={(e) => mutateElement(panelIdx, el.id, { bg: e.target.value })}
                  />
                </div>
                <div>
                  <label className="text-sm block mb-1">Radius</label>
                  <input
                    type="number" className="w-full border rounded p-1"
                    value={el.radius ?? 12}
                    onChange={(e) => mutateElement(panelIdx, el.id, { radius: Number(e.target.value || 0) })}
                  />
                </div>
                <div>
                  <label className="text-sm block mb-1">Align</label>
                  <select
                    className="w-full border rounded p-1"
                    value={el.align || 'left'}
                    onChange={(e) => mutateElement(panelIdx, el.id, { align: e.target.value })}
                  >
                    <option>left</option>
                    <option>center</option>
                    <option>right</option>
                  </select>
                </div>
              </div>
            </>
          )}

          {/* common numeric controls */}
          <div className="grid grid-cols-2 gap-2">
            <div>
              <label className="text-sm block mb-1">X</label>
              <input type="number" className="w-full border rounded p-1"
                value={el.x}
                onChange={(e) => mutateElement(panelIdx, el.id, { x: Number(e.target.value || 0) })}
              />
            </div>
            <div>
              <label className="text-sm block mb-1">Y</label>
              <input type="number" className="w-full border rounded p-1"
                value={el.y}
                onChange={(e) => mutateElement(panelIdx, el.id, { y: Number(e.target.value || 0) })}
              />
            </div>
            <div>
              <label className="text-sm block mb-1">W</label>
              <input type="number" className="w-full border rounded p-1"
                value={el.w}
                onChange={(e) => mutateElement(panelIdx, el.id, { w: Number(e.target.value || 0) })}
              />
            </div>
            <div>
              <label className="text-sm block mb-1">H</label>
              <input type="number" className="w-full border rounded p-1"
                value={el.h}
                onChange={(e) => mutateElement(panelIdx, el.id, { h: Number(e.target.value || 0) })}
              />
            </div>
            <div>
              <label className="text-sm block mb-1">Rotate</label>
              <input type="number" className="w-full border rounded p-1"
                value={el.rotate || 0}
                onChange={(e) => mutateElement(panelIdx, el.id, { rotate: Number(e.target.value || 0) })}
              />
            </div>
            <div>
              <label className="text-sm block mb-1">Z-index</label>
              <input type="number" className="w-full border rounded p-1"
                value={el.z || 0}
                onChange={(e) => mutateElement(panelIdx, el.id, { z: Number(e.target.value || 0) })}
              />
            </div>
          </div>
        </div>
      )}
    </aside>
  );
}

// --- boot ---
const root = ReactDOM.createRoot(document.getElementById('root'));
root.render(<App />);
