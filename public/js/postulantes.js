import { api }            from './api.js';
import { descargarExcel } from './excel.js';

export function initPostulantes() {
  /* ─────────────── refs DOM ─────────────── */
  const dniInput        = document.getElementById('dniInput');
  const campSelect      = document.getElementById('campaniaSelect');
  const mesInput        = document.getElementById('mesInput');
  const capaSelect      = document.getElementById('capaSelect');
  const btnCargar       = document.getElementById('btnCargar');

  // ── refs para el toggle Asist/Eval ──
  const toggleWrapper = document.getElementById('toggleWrapper');
  const tabAsist      = document.getElementById('tabAsist');
  const tabEval       = document.getElementById('tabEval');


  const tablaContainer  = document.getElementById('tablaContainer');

  const accionesDiv     = document.getElementById('acciones');
  const btnGuardar      = document.getElementById('btnGuardar');
  const btnGuardarDes   = document.getElementById('btnGuardarDes');
  const btnExcel        = document.getElementById('btnExcel');

  const desWrapper      = document.getElementById('desercionesWrapper');
  const desContainer    = document.getElementById('desercionesContainer');
  const accionesDes     = document.getElementById('accionesDeserciones');
  const resumenWrapper = document.getElementById('resumenWrapper');

  // Funciones de toggle **aquí adentro**, así tienen acceso a las refs:
  function showAsistencias() {
    tabAsist.classList.replace('bg-gray-200','bg-blue-600');
    tabAsist.classList.replace('text-gray-700','text-white');
    tabEval .classList.replace('bg-blue-600','bg-gray-200');
    tabEval .classList.replace('text-white','text-gray-700');
    renderTabla();
  }

  function showEvaluaciones() {
    tabEval .classList.replace('bg-gray-200','bg-blue-600');
    tabEval .classList.replace('text-gray-700','text-white');
    tabAsist.classList.replace('bg-blue-600','bg-gray-200');
    tabAsist.classList.replace('text-white','text-gray-700');
    renderEvaluaciones();
  }




  /* ─────────────── estado ─────────────── */
  let dias        = [];
  let capCount    = 5;
  let evaluaciones = [];    // [{ postulante_dni, fecha_evaluacion, nota }, …]
  let tablaDatos  = [];
  let deserciones = [];
  let filtroCache = '';
  let dirty       = false;

  /* ─────────────── helpers ─────────────── */
  const nextDate = iso => {
    const [y,m,d] = iso.split('-').map(Number);
    const dt = new Date(y, m-1, d);
    do { dt.setDate(dt.getDate()+1); } while (dt.getDay() === 0);
    return dt.toISOString().slice(0,10);
  };
  const refreshOJT = () => {
    for (let i = capCount; i < dias.length; i++) {
      dias[i] = nextDate(dias[i-1]);
    }
  };
  const setDirty = v => {
    dirty = v;
    btnGuardar.classList.toggle('hidden', !v);
    if (btnGuardarDes) btnGuardarDes.classList.toggle('hidden', !v);
  };

  /* ────────── handler botón Cargar ────────── */
  btnCargar.onclick = async () => {
    const dniCap = dniInput.value.trim();
    const camp   = campSelect.value;
    const mes    = mesInput.value;
    if (!dniCap || !mes) return alert('Completa los filtros');

    // 1) cargar lotes
    const fKey = `${dniCap}|${camp}|${mes}`;
    if (fKey !== filtroCache || !capaSelect.options.length) {
      const lotes = await api(
        `/api/capas?dniCap=${dniCap}` +
        `&campania=${encodeURIComponent(camp)}` +
        `&mes=${mes}`
      );
      if (!lotes.length) { alert('Sin datos para ese filtro'); return; }
      capaSelect.innerHTML = lotes
        .map(l => `<option value="${l.fechaInicio}">Capa ${l.capa} – ${l.fechaInicio}</option>`)
        .join('');
      capaSelect.classList.remove('hidden');
      filtroCache = fKey;
    }
    const fechaIni = capaSelect.value;
    const capaNum  = capaSelect.selectedIndex + 1;  // <-- calculamos el número de capa

    // 2) cargar postulantes y asistencias
    const { postulantes, asistencias, duracion } = await api(
      `/api/postulantes?dniCap=${dniCap}` +
      `&campania=${encodeURIComponent(camp)}` +
      `&mes=${mes}&fechaInicio=${fechaIni}`
    );

    // 3) construir fechas y tablaDatos base
    dias = [fechaIni];
    while (dias.length < duracion.cap + duracion.ojt) {
      dias.push(nextDate(dias.at(-1)));
    }
    capCount = duracion.cap;
    tablaDatos = postulantes.map(p => ({
      ...p,
      numero     : p.telefono || '',
      asistencia : dias.map(() => '')
    }));

    // 4) rellenar asistencias previas
    const posDni = Object.fromEntries(tablaDatos.map((p,i) => [p.dni,i]));
    const posF   = Object.fromEntries(dias.map((d,i) => [d,i]));
    asistencias.forEach(a => {
      const r = posDni[a.postulante_dni], c = posF[a.fecha];
      if (r != null && c != null) {
        tablaDatos[r].asistencia[c] = a.estado_asistencia;
      }
    });

    // 5) cargar deserciones del servidor, incluyendo &capa=
    const desPrev = await api(
      `/api/deserciones?` +
      `dniCap=${dniCap}` +
      `&campania=${encodeURIComponent(camp)}` +
      `&mes=${mes}` +
      `&capa=${capaNum}`
    );
    // 6) asignar y permitir editar motivo
    deserciones = desPrev.map(d => ({
      ...d,
      capa_numero: capaNum,
      guardado: false
    }));

    // 7) renderizar deserciones y mostrar el panel
    renderDeserciones();
    desWrapper.classList.remove('hidden');
    if (accionesDes) accionesDes.classList.remove('hidden');

    // 8) ocultar botón “Guardar” hasta que haya cambios
    setDirty(false);
    
    // 9) renderizar tabla de asistencias
    renderTabla();

    // 10) renderizar tabla de resumen
    renderResumen();



    // 11) mostrar el toggle de vistas
    const toggleWrapper = document.getElementById('toggleWrapper');
    toggleWrapper.classList.remove('hidden');

    // estado inicial: mostramos Asistencias
    showAsistencias()

    // clics en los tabs
    tabAsist.onclick = () => showAsistencias()
    tabEval .onclick = () => showEvaluaciones()

  };








  /* ═══════════════════ TABLA DE ASISTENCIA ═══════════════════ */
  function renderTabla() {
    const ojtCount = dias.length - capCount;

    /* cabeceras */
    const head1 = `
      <tr>
        <th colspan="3" class="border-0"></th>
        <th colspan="${capCount}" class="border bg-indigo-300 text-center">
          <span data-action="subCap" class="cursor-pointer text-red-700">−</span>
          Capacitación
          <span data-action="addCap" class="cursor-pointer text-blue-800">+</span>
        </th>
        ${ojtCount ? `
        <th colspan="${ojtCount}" class="border bg-teal-300 text-center">
          <span data-action="subOjt" class="cursor-pointer text-red-700">−</span>
          OJT
          <span data-action="addOjt" class="cursor-pointer text-teal-800">+</span>
        </th>` : ''}
      </tr>`;
    const head2 = `
      <tr><th></th><th></th><th></th>${
        dias.map((_,i) => `
          <th class="border px-2 text-center ${
            i < capCount ? 'bg-indigo-200' : 'bg-teal-200'
          }">Día ${i+1}</th>`
        ).join('')
      }</tr>`;
    const head3 = `
      <tr>
        <th class="border px-2">Nombre</th>
        <th class="border px-2">DNI</th>
        <th class="border px-2">Número</th>${
        dias.map((d,i) => `
          <th class="border px-2 text-center ${
            i < capCount ? 'bg-indigo-200' : 'bg-teal-200'
          }">${d}</th>`
        ).join('')
      }</tr>`;

    /* cuerpo */
    const body = tablaDatos.map((p,r) => `
      <tr>
        <td class="border px-2">${p.nombre}</td>
        <td class="border px-2 text-center">${p.dni}</td>
        <td class="border px-2 text-center">${p.numero}</td>${
        dias.map((_,c) => `
          <td class="border px-2 ${
            c < capCount ? 'bg-indigo-50' : 'bg-teal-50'
          }">
            <select data-row="${r}" data-col="${c}"
                    class="w-full outline-none bg-transparent">
              <option value=""></option>
              <option>A</option><option>T</option>
              <option>F</option><option>J</option>
              <option value="D">Deserción</option>
            </select>
          </td>`).join('')
      }</tr>`).join('');

    tablaContainer.innerHTML = `
      <table class="min-w-max bg-white border-collapse text-sm">
        <thead>${head1}${head2}${head3}</thead>
        <tbody>${body}</tbody>
      </table>`;

    /* header listeners */
    tablaContainer.querySelector('thead').onclick = e => {
      const a = e.target.dataset.action;
      if (a === 'addCap') addCap();
      if (a === 'subCap') subCap();
      if (a === 'addOjt') addOjt();
      if (a === 'subOjt') subOjt();
    };

    const lockAfter = (sel, cIdx) => {
      const tr = sel.closest('tr')
      tr.classList.add('bg-red-100')
      tr.querySelectorAll('select').forEach((s, i) => {
        const td = s.closest('td')
        if (i > cIdx) {
          s.value = '---'
          s.disabled = true
          s.classList.add('appearance-none');
          // quito los viejos bg y pongo gris oscuro
          td.classList.remove('bg-indigo-50', 'bg-teal-50')
          td.classList.add('bg-gray-300')
        }
      })
    }

    const unlockRow = sel => {
      const tr = sel.closest('tr')
      tr.classList.remove('bg-red-100')
      tr.querySelectorAll('select').forEach((s, i) => {
        const td = s.closest('td')
        if (s.disabled) {
          s.disabled = false
          td.classList.remove('bg-gray-300')
          // vuelvo a poner el fondo original según si es CAP o OJT
          if (i < capCount) td.classList.add('bg-indigo-50')
          else             td.classList.add('bg-teal-50')
          if (s.value === '---') s.value = ''
        }
      })
    }


    /* bind selects */
    tablaContainer.querySelectorAll('select').forEach(sel => {
      const { row, col } = sel.dataset;
      sel.value = tablaDatos[row].asistencia[col] || '';

      if (sel.value === 'D') lockAfter(sel, +col);

      sel.onchange = e => {
        const val = e.target.value;
        tablaDatos[row].asistencia[col] = val;
        const dni     = tablaDatos[row].dni;
        const capaNum = capaSelect.selectedIndex + 1;

        if (val === 'D') {
          lockAfter(sel, +col);
          const obj = {
            postulante_dni  : dni,
            nombre          : tablaDatos[row].nombre,
            numero          : tablaDatos[row].numero,
            fecha_desercion : dias[col],
            motivo          : '',
            capa_numero     : capaNum,
            guardado        : false
          };
          const found = deserciones.find(d => d.postulante_dni === dni);
          if (!found) deserciones.push(obj);
          else Object.assign(found, obj);

        } else {
          unlockRow(sel);
          const idx = deserciones.findIndex(d =>
            d.postulante_dni === dni && !d.guardado
          );
          if (idx > -1) deserciones.splice(idx, 1);
        }

        renderDeserciones();
        setDirty(true);
      };
    });
  }

  function renderEvaluaciones() {
    // 1) cabeceras: Nombre/DNI/Nº + sólo días de capacitación
    const head1 = `
      <tr>
        <th colspan="3" class="border-0"></th>
        <th colspan="${capCount}"
            class="border bg-indigo-300 text-center">Capacitación</th>
      </tr>`;
    const head2 = `
      <tr>
        <th></th><th></th><th></th>
        ${dias.slice(0, capCount).map((_,i) => `
          <th class="border px-2 text-center bg-indigo-200">Día ${i+1}</th>
        `).join('')}
      </tr>`;
    const head3 = `
      <tr>
        <th class="border px-2">Nombre</th>
        <th class="border px-2">DNI</th>
        <th class="border px-2">Número</th>
        ${dias.slice(0, capCount).map(d => `
          <th class="border px-2 text-center bg-indigo-200">${d}</th>
        `).join('')}
      </tr>`;

    // 2) cuerpo: un input number 0–10 por celda
    const body = tablaDatos.map((p,r) => `
      <tr>
        <td class="border px-2">${p.nombre}</td>
        <td class="border px-2 text-center">${p.dni}</td>
        <td class="border px-2 text-center">${p.numero}</td>
        ${dias.slice(0, capCount).map((d,i) => {
          // buscar nota previa
          const ev = evaluaciones.find(e =>
            e.postulante_dni === p.dni &&
            e.fecha_evaluacion === d
          );
          const val = ev ? ev.nota : '';
          return `
            <td class="border px-2 bg-indigo-50">
              <input type="number" min="0" max="10"
                    class="w-full text-center outline-none bg-transparent"
                    data-row="${r}" data-col="${i}"
                    value="${val}">
            </td>`;
        }).join('')}
      </tr>
    `).join('');

    // 3) renderizar
    tablaContainer.innerHTML = `
      <table class="min-w-max bg-white border-collapse text-sm">
        <thead>${head1}${head2}${head3}</thead>
        <tbody>${body}</tbody>
      </table>`;

    // 4) bind input para actualizar evaluaciones y marcar como “dirty”
    tablaContainer.querySelectorAll('input[type=number]').forEach(inp => {
      inp.onchange = e => {
        const row = +e.target.dataset.row;
        const col = +e.target.dataset.col;
        const dni = tablaDatos[row].dni;
        const fecha = dias[col];
        const nota  = e.target.value === '' ? null : +e.target.value;

        // actualizar array evaluaciones
        const idx = evaluaciones.findIndex(ev =>
          ev.postulante_dni === dni &&
          ev.fecha_evaluacion === fecha
        );
        if (nota == null) {
          if (idx > -1) evaluaciones.splice(idx,1);
        } else {
          if (idx > -1) evaluaciones[idx].nota = nota;
          else evaluaciones.push({ postulante_dni: dni, fecha_evaluacion: fecha, nota });
        }
        setDirty(true);
      };
    });
  }




  /* ═════════════ tabla reporte deserciones ═════════════ */
  function renderDeserciones() {
    if (!deserciones.length) {
      desContainer.innerHTML =
        '<p class="text-sm italic text-gray-500">Sin deserciones registradas</p>';
      return;
    }

    desContainer.innerHTML = `
      <table class="text-sm border-collapse min-w-max">
        <thead>
          <tr class="bg-red-200">
            <th class="border px-2">Nombre</th>
            <th class="border px-2">DNI</th>
            <th class="border px-2">Número</th>
            <th class="border px-2">Fecha</th>
            <th class="border px-2 min-w-[300px]">Motivo</th>
          </tr>
        </thead>
        <tbody>
          ${deserciones.map(d => `
            <tr class="${d.guardado ? 'bg-gray-50' : ''}">
              <td class="border px-2">${d.nombre}</td>
              <td class="border px-2 text-center">${d.postulante_dni}</td>
              <td class="border px-2 text-center">${d.numero}</td>
              <td class="border px-2 text-center">${d.fecha_desercion}</td>
              <td class="border px-2 min-w-[300px]">
                <input class="w-full bg-transparent outline-none ${
                  d.guardado ? 'opacity-50' : ''
                }"
                       data-dni="${d.postulante_dni}"
                       value="${d.motivo || ''}"
                       placeholder = "Ingrese el motivo"
                       ${d.guardado ? 'disabled' : ''}/>
              </td>
            </tr>`).join('')}
        </tbody>
      </table>`;

    desContainer.querySelectorAll('input:not([disabled])')
      .forEach(inp => {
        inp.oninput = e => {
          const d = deserciones.find(x => x.postulante_dni === inp.dataset.dni);
          if (d) { d.motivo = e.target.value; setDirty(true); }
        };
      });
  }

  /* ═════════════ columnas dinámicas + / − ═════════════ */
  function addCap() {
    dias.splice(capCount, 0, nextDate(dias[capCount - 1]));
    capCount++;
    tablaDatos.forEach(p => p.asistencia.splice(capCount - 1, 0, ''));
    refreshOJT(); renderTabla(); setDirty(true);
  }
  function subCap() {
    if (capCount <= 1) return;
    dias.splice(capCount - 1, 1);
    capCount--;
    tablaDatos.forEach(p => p.asistencia.splice(capCount, 1));
    refreshOJT(); renderTabla(); setDirty(true);
  }
  function addOjt() {
    dias.push(nextDate(dias.at(-1)));
    tablaDatos.forEach(p => p.asistencia.push(''));
    renderTabla(); setDirty(true);
  }
  function subOjt() {
    if (dias.length <= capCount) return;
    dias.pop();
    tablaDatos.forEach(p => p.asistencia.pop());
    renderTabla(); setDirty(true);
  }

  /* ═════════════ GUARDAR todo ═════════════ */
  const handleSave = async () => {
   // Volvemos a tomar la capa seleccionada
   const fechaIni = capaSelect.value;
    // 1) payload de asistencia
    const payloadA = [];
    tablaDatos.forEach(p => {
      p.asistencia.forEach((est,i) => {
        if (est) {
          payloadA.push({
            postulante_dni    : p.dni,
            fecha             : dias[i],
            etapa             : i < capCount ? 'Capacitacion' : 'OJT',
            estado_asistencia : est
          });
        }
      });
    });

    // 2) payload de deserciones
    let desToSend = deserciones
      .filter(d => d.motivo && d.motivo.trim() !== '')
      .map(d => ({
        postulante_dni  : d.postulante_dni,
        fecha_desercion : d.fecha_desercion,
        motivo          : d.motivo,
        capa_numero     : d.capa_numero
      }));

    // 3) nada que guardar?
    if (!payloadA.length && !desToSend.length) {
      alert('Nada por guardar');
      return;
    }

    // 4) enviar asistencia
    if (payloadA.length) {
      await api('/api/asistencia/bulk', {
        method : 'POST',
        headers: { 'Content-Type': 'application/json' },
        body   : JSON.stringify(payloadA)
      });
    }

    // 5) enviar deserciones (ahora con fechaInicio)
    if (desToSend.length) {
      const desToSendConFecha = desToSend.map(d => ({
        ...d,
       fechaInicio: fechaIni      // <-- ahora sí, porque lo acabamos de definir
      }));
      console.log('🛠 Deserciones a enviar:', desToSendConFecha);

      await api('/api/deserciones/bulk', {
        method : 'POST',
        headers: { 'Content-Type': 'application/json' },
        body   : JSON.stringify(desToSendConFecha)
      });

      deserciones.forEach(d => d.guardado = true);
      renderDeserciones();
      localStorage.setItem('deserciones', JSON.stringify(deserciones));
    }

    // 6) feedback al usuario
    alert('Cambios guardados ✔️');
    setDirty(false);
    desWrapper.classList.remove('hidden');
    if (accionesDes) accionesDes.classList.remove('hidden');

    renderResumen();
  };

  // atar ambos botones al mismo handler
  btnGuardar.onclick    = handleSave;
  if (btnGuardarDes) btnGuardarDes.onclick = handleSave;

  /* ═════════════ Excel ═════════════ */
  btnExcel.onclick = () =>
    descargarExcel({ tablaDatos, dias, capCount });




function renderResumen() {
  const campaña     = campSelect.value;
  const capacitador = `${document.getElementById('nombresCap').value} ${document.getElementById('apePatCap').value} ${document.getElementById('apeMatCap').value}`;
  const total       = tablaDatos.length;
  const bajas       = deserciones.length;
  const activos     = total - bajas;

resumenWrapper.innerHTML = `
  <h2 class="text-2xl font-bold mb-4 text-gray-800">Resumen</h2>
  <table class="table-fixed w-full text-sm border-collapse border border-gray-200">
    <tbody>
      <tr class="h-12">
        <td class="border border-gray-200 px-3 py-2 font-semibold text-gray-700">Capacitador</td>
        <td class="border border-gray-200 px-3 py-2 text-center text-gray-900">${capacitador}</td>
      </tr>
      <tr class="h-12">
        <td class="border border-gray-200 px-3 py-2 font-semibold text-gray-700">Campaña</td>
        <td class="border border-gray-200 px-3 py-2 text-center text-gray-900">${campaña}</td>
      </tr>
      <tr class="h-12 bg-gray-100">
        <td class="border border-gray-200 px-3 py-2 font-semibold text-gray-700">Total Postulantes</td>
        <td class="border border-gray-200 px-3 py-2 text-center text-gray-900">${total}</td>
      </tr>
      <tr class="h-12 bg-red-100">
        <td class="border border-gray-200 px-3 py-2 font-semibold text-gray-700">Deserciones/Bajas</td>
        <td class="border border-gray-200 px-3 py-2 text-center text-gray-900">${bajas}</td>
      </tr>
      <tr class="h-12 bg-green-100">
        <td class="border border-gray-200 px-3 py-2 font-semibold text-gray-700">Activos</td>
        <td class="border border-gray-200 px-3 py-2 text-center text-gray-900">${activos}</td>
      </tr>
    </tbody>
  </table>
`;
resumenWrapper.classList.remove('hidden');

}


  function showAsistencias() {
    // estilos del toggle
    tabAsist.classList.replace('bg-gray-200','bg-blue-600');
    tabAsist.classList.replace('text-gray-700','text-white');
    tabEval .classList.replace('bg-blue-600','bg-gray-200');
    tabEval .classList.replace('text-white','text-gray-700');

    // mostramos la tabla de asistencias y ocultamos evaluaciones
    renderTabla();
  }

  function showEvaluaciones() {
    tabEval .classList.replace('bg-gray-200','bg-blue-600');
    tabEval .classList.replace('text-gray-700','text-white');
    tabAsist.classList.replace('bg-blue-600','bg-gray-200');
    tabAsist.classList.replace('text-white','text-gray-700');

    // aquí luego llamaremos a renderEvaluaciones();
    renderEvaluaciones();
  }







}

