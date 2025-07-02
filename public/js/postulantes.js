/* public/js/postulantes.js
   ----------------------------------------------------------
   Maneja capas (lotes), tabla de asistencia y reporte
   de deserciones. Un solo botón “Guardar cambios” persiste
   TODO (asistencia + nuevas deserciones) en el backend.
*/
import { api }            from './api.js';
import { descargarExcel } from './excel.js';

export function initPostulantes() {
  /* ──────────────────────────── refs DOM ─────────────────────────── */
  const dniInput        = document.getElementById('dniInput');
  const campSelect      = document.getElementById('campaniaSelect');
  const mesInput        = document.getElementById('mesInput');
  const capaSelect      = document.getElementById('capaSelect');
  const btnCargar       = document.getElementById('btnCargar');

  const tablaContainer  = document.getElementById('tablaContainer');

  const accionesDiv     = document.getElementById('acciones');
  const btnGuardar      = document.getElementById('btnGuardar');
  const btnExcel        = document.getElementById('btnExcel');

  /* 2ª tabla – Deserciones */
  const desWrapper      = document.getElementById('desercionesWrapper');   // div
  const desContainer    = document.getElementById('desercionesContainer'); // <table> se inyecta aquí

  /* ───────────────────────────── estado ──────────────────────────── */
  let dias        = [];            // ['YYYY-MM-DD', …]
  let capCount    = 5;             // nº columnas de capacitación
  let tablaDatos  = [];            // [{ nombre,dni,numero, asistencia[] }]
  let deserciones = [];            // [{postulante_dni, nombre, numero, fecha_desercion, motivo, capa_numero, guardado}]
  let filtroCache = '';            // para no pedir lotes cada vez
  let dirty       = false;

  /* ──────────────────────────── helpers ──────────────────────────── */
  const nextDate = iso => {
    const [y, m, d] = iso.split('-').map(Number);
    const dt = new Date(y, m - 1, d);
    do { dt.setDate(dt.getDate() + 1); } while (dt.getDay() === 0);
    return dt.toISOString().slice(0, 10);
  };
  const refreshOJT = () => {
    for (let i = capCount; i < dias.length; i++) dias[i] = nextDate(dias[i - 1]);
  };
  const setDirty = v => { dirty = v; btnGuardar.classList.toggle('hidden', !v); };

  /* ────────────────── CARGAR (capas, postulantes…) ───────────────── */
  btnCargar.onclick = async () => {
    const dniCap = dniInput.value.trim();
    const camp   = campSelect.value;
    const mes    = mesInput.value;
    if (!dniCap || !mes) return alert('Completa los filtros');

    /* 1️⃣ lotes (capas) */
    const fKey = `${dniCap}|${camp}|${mes}`;
    if (fKey !== filtroCache || !capaSelect.options.length) {
      const lotes = await api(`/api/capas?dniCap=${dniCap}&campania=${encodeURIComponent(camp)}&mes=${mes}`);
      if (!lotes.length) return alert('Sin datos para ese filtro');

      const before = capaSelect.value;
      capaSelect.innerHTML = lotes.map(l =>
        `<option value="${l.fechaInicio}">Capa ${l.capa} – ${l.fechaInicio}</option>`
      ).join('');
      if ([...capaSelect.options].some(o => o.value === before)) capaSelect.value = before;
      capaSelect.classList.remove('hidden');
      filtroCache = fKey;
    }
    const fechaIni = capaSelect.value;

    /* 2️⃣ datos de la capa seleccionada */
    const data = await api(
      `/api/postulantes?dniCap=${dniCap}&campania=${encodeURIComponent(camp)}&mes=${mes}&fechaInicio=${fechaIni}`
    );
    const { postulantes, asistencias, duracion } = data;

    /* 3️⃣ generar fechas partiendo de fechaIni */
    dias = [fechaIni];
    while (dias.length < duracion.cap + duracion.ojt) dias.push(nextDate(dias.at(-1)));
    capCount = duracion.cap;

    /* 4️⃣ tabla de asistencia vacía */
    tablaDatos = postulantes.map(p => ({
      ...p,
      numero: p.telefono || '',
      asistencia: dias.map(() => '')
    }));

    /* 5️⃣ inyectar asistencias previas */
    const posDni = Object.fromEntries(tablaDatos.map((p, i) => [p.dni, i]));
    const posF   = Object.fromEntries(dias.map((d, i) => [d, i]));
    asistencias.forEach(a => {
      const r = posDni[a.postulante_dni];
      const c = posF[a.fecha];
      if (r != null && c != null) tablaDatos[r].asistencia[c] = a.estado_asistencia;
    });

    /* 6️⃣ deserciones ya guardadas */
    const desPrev = await api(
      `/api/deserciones?dniCap=${dniCap}&campania=${encodeURIComponent(camp)}` +
      `&mes=${mes}&fechaInicio=${fechaIni}`
    );
    deserciones = desPrev.map(d => ({ ...d, guardado: true }));

    /* render */
    renderTabla();
    renderDeserciones();
    accionesDiv.classList.remove('hidden');
    desWrapper.classList.remove('hidden');
    setDirty(false);
  };

  /* ────────────────────────── TABLA ASISTENCIA ───────────────────── */
  function renderTabla() {
    const ojt = dias.length - capCount;

    /* cabeceras */
    const head1 = `
      <tr>
        <th colspan="3" class="border-0"></th>
        <th colspan="${capCount}" class="border bg-indigo-300 text-center">
          <span data-action="subCap" class="cursor-pointer text-red-700">−</span>
          Capacitación
          <span data-action="addCap" class="cursor-pointer text-blue-800">+</span>
        </th>
        ${ ojt ? `
        <th colspan="${ojt}" class="border bg-teal-300 text-center">
          <span data-action="subOjt" class="cursor-pointer text-red-700">−</span>
          OJT
          <span data-action="addOjt" class="cursor-pointer text-teal-800">+</span>
        </th>` : '' }
      </tr>`;
    const head2 = `
      <tr><th></th><th></th><th></th>${
        dias.map((_,i)=>`
          <th class="border px-2 text-center ${i<capCount?'bg-indigo-200':'bg-teal-200'}">
            Día ${i+1}
          </th>`).join('')
      }</tr>`;
    const head3 = `
      <tr>
        <th class="border px-2">Nombre</th>
        <th class="border px-2">DNI</th>
        <th class="border px-2">Número</th>${
        dias.map((d,i)=>`
          <th class="border px-2 text-center ${i<capCount?'bg-indigo-200':'bg-teal-200'}">${d}</th>`
        ).join('')
      }</tr>`;

    /* cuerpo */
    const body = tablaDatos.map((p,r)=>`
      <tr>
        <td class="border px-2">${p.nombre}</td>
        <td class="border px-2 text-center">${p.dni}</td>
        <td class="border px-2 text-center">${p.numero}</td>${
        dias.map((_,c)=>`
          <td class="border px-2 ${c<capCount?'bg-indigo-50':'bg-teal-50'}">
            <select class="w-full bg-transparent outline-none"
                    data-row="${r}" data-col="${c}">
              <option value=""></option><option>A</option><option>T</option>
              <option>F</option><option>J</option><option value="D">Deserción</option>
            </select>
          </td>`).join('')
      }</tr>`).join('');

    tablaContainer.innerHTML = `
      <table class="min-w-max bg-white border-collapse text-sm">
        <thead>${head1}${head2}${head3}</thead>
        <tbody>${body}</tbody>
      </table>`;

    /* listeners encabezado + / − */
    tablaContainer.querySelector('thead').onclick = e=>{
      const a=e.target.dataset.action;
      if(a==='addCap') addCap();
      if(a==='subCap') subCap();
      if(a==='addOjt') addOjt();
      if(a==='subOjt') subOjt();
    };

    /* listeners selects */
    tablaContainer.querySelectorAll('select').forEach(sel=>{
      const {row,col}=sel.dataset;
      sel.value = tablaDatos[row].asistencia[col] || '';
      sel.onchange = e=>{
        const val = e.target.value;
        tablaDatos[row].asistencia[col] = val;
        const tr = sel.closest('tr');

        if (val === 'D') {                       /* ⬅ Deserción */
          tr.classList.add('bg-red-100');
          tr.querySelectorAll('select').forEach((s,iSel)=>{
            if (iSel > col){ s.value=''; s.disabled=true; }
          });
          /* registrar / actualizar en array deserciones */
          const dni     = tablaDatos[row].dni;
          const existe  = deserciones.find(d=>d.postulante_dni===dni);
          const capaNum = capaSelect.selectedIndex + 1;
          const obj = {
            postulante_dni : dni,
            nombre         : tablaDatos[row].nombre,
            numero         : tablaDatos[row].numero,
            fecha_desercion: dias[col],
            motivo         : '',
            capa_numero    : capaNum,
            guardado       : false
          };
          if (!existe) deserciones.push(obj);
          else Object.assign(existe, obj);
          renderDeserciones();
        } else {                                /* ya NO es deserción */
          tr.classList.remove('bg-red-100');
          tr.querySelectorAll('select').forEach(s=> s.disabled=false);
          const idx = deserciones.findIndex(d=>d.postulante_dni===tablaDatos[row].dni);
          if (idx>-1 && !deserciones[idx].guardado) deserciones.splice(idx,1);
          renderDeserciones();
        }
        setDirty(true);
      };
    });
  }

  /* ─────────── tabla de deserciones (solo-lectura + motivo) ───────── */
  function renderDeserciones(){
    if(!deserciones.length){
      desContainer.innerHTML = '<p class="text-sm italic text-gray-500">Sin deserciones registradas</p>';
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
            <th class="border px-2">Motivo</th>
          </tr>
        </thead>
        <tbody>
          ${deserciones.map(d=>`
            <tr class="${d.guardado?'bg-gray-50':''}">
              <td class="border px-2">${d.nombre}</td>
              <td class="border px-2 text-center">${d.postulante_dni}</td>
              <td class="border px-2 text-center">${d.numero}</td>
              <td class="border px-2 text-center">${d.fecha_desercion}</td>
              <td class="border px-2">
                <input type="text" class="w-full outline-none bg-transparent ${d.guardado?'opacity-50':''}"
                       data-dni="${d.postulante_dni}"
                       value="${d.motivo||''}"
                       ${d.guardado?'disabled':''}>
              </td>
            </tr>`).join('')}
        </tbody>
      </table>`;

    /* recoger motivo (solo para los nuevos) */
    desContainer.querySelectorAll('input:not([disabled])').forEach(inp=>{
      inp.oninput = e=>{
        const d = deserciones.find(x=>x.postulante_dni===inp.dataset.dni);
        if(d){ d.motivo = e.target.value; setDirty(true); }
      };
    });
  }

  /* ──────────────── operaciones columnas (+ / −) ─────────────────── */
  function addCap(){ dias.splice(capCount,0,nextDate(dias[capCount-1])); capCount++;
    tablaDatos.forEach(p=>p.asistencia.splice(capCount-1,0,'')); refreshOJT(); renderTabla(); setDirty(true);}
  function subCap(){ if(capCount<=1)return; dias.splice(capCount-1,1); capCount--;
    tablaDatos.forEach(p=>p.asistencia.splice(capCount,1)); refreshOJT(); renderTabla(); setDirty(true);}
  function addOjt(){ dias.push(nextDate(dias.at(-1))); tablaDatos.forEach(p=>p.asistencia.push(''));
    renderTabla(); setDirty(true);}
  function subOjt(){ if(dias.length<=capCount)return; dias.pop(); tablaDatos.forEach(p=>p.asistencia.pop());
    renderTabla(); setDirty(true);}

  /* ─────────────────────── GUARDAR único ─────────────────────────── */
  btnGuardar.onclick = async ()=>{
    /* 1. asistencia */
    const payloadA = [];
    tablaDatos.forEach(p=>{
      p.asistencia.forEach((est,i)=>{
        if(est){
          payloadA.push({
            postulante_dni:p.dni,
            fecha:dias[i],
            etapa:i<capCount?'Capacitacion':'OJT',
            estado_asistencia:est
          });
        }
      });
    });

    /* 2. solo deserciones NO guardadas aún */
    const nuevosDes = deserciones.filter(d=>!d.guardado)
      .map(d=>({
        postulante_dni : d.postulante_dni,
        fecha_desercion: d.fecha_desercion,
        motivo         : d.motivo,
        capa_numero    : d.capa_numero
      }));

    if(!payloadA.length && !nuevosDes.length){
      alert('Nada por guardar'); return;
    }

    if(payloadA.length){
      await api('/api/asistencia/bulk',{
        method:'POST', headers:{'Content-Type':'application/json'},
        body:JSON.stringify(payloadA)
      });
    }
    if(nuevosDes.length){
      await api('/api/deserciones/bulk',{
        method:'POST', headers:{'Content-Type':'application/json'},
        body:JSON.stringify(nuevosDes)
      });
      /* márcalas como guardadas */
      deserciones.forEach(d=> d.guardado = true);
      renderDeserciones();
    }

    alert('Cambios guardados ✔️');
    setDirty(false);
  };

  /* ─────────────────────── Excel ─────────────────────── */
  btnExcel.onclick = ()=> descargarExcel({ tablaDatos, dias, capCount });
}
