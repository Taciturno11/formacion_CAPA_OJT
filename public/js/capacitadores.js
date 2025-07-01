import { api } from './api.js';

export async function initCapacitadores() {
  // 1) Poblar el datalist
  const lista = await api('/api/capacitadores');
  document.getElementById('capacitadoresList').innerHTML =
    lista.map(c => `<option value="${c.dni}">${c.dni} – ${c.nombreCompleto}</option>`).join('');

  // 2) Botón Validar
  const btn = document.getElementById('btnValidar');
  btn.onclick = async () => {
    const dni = document.getElementById('dniInput').value.trim();
    if (!dni) return alert('Ingresa DNI');

    try {
      const data = await api(`/api/capacitadores/${dni}`);
      // Mostrar datos del capacitador
      document.getElementById('nombresCap').value   = data.nombres;
      document.getElementById('apePatCap').value    = data.apellidoPaterno;
      document.getElementById('datosCapacitador').classList.remove('hidden');

      // Poner campañas y desocultar selector
      const sel = document.getElementById('campaniaSelect');
      sel.innerHTML = data.campañas.map(c => `<option>${c}</option>`).join('');
      document.getElementById('selector').classList.remove('hidden');

    } catch {
      alert('DNI inválido o no es capacitador activo');
    }
  };
}
