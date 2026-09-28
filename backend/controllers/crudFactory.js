/**
 * Fabrica de controladores CRUD.
 * Los tres modulos de catalogo (productos, proveedores, categorias) comparten
 * la misma logica de paginacion, filtrado y borrado logico; solo cambian el
 * modelo y los campos buscables.
 */

// El texto buscado se usa como literal (sus metacaracteres se escapan) y cada
// vocal acepta su forma con tilde: "camara" encuentra "Cámara".
const EQUIVALENTES = { a: '[aá]', e: '[eé]', i: '[ií]', o: '[oó]', u: '[uúü]', n: '[nñ]' };
function patronBusqueda(texto) {
  return String(texto).slice(0, 60)
    .normalize('NFD').replace(/[\u0300-\u036f]/g, '')
    .replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
    .replace(/[aeioun]/gi, c => EQUIVALENTES[c.toLowerCase()]);
}

function crearControlador(Modelo, opciones = {}) {
  const { campoTexto = 'nombre', poblar = [], campoActivo = 'activo', camposEditables = null,
          orden = { creado_en: -1 } } = opciones;

  async function listar(req, res, next) {
    try {
      const pagina = Math.max(1, parseInt(req.query.pagina, 10) || 1);
      const limite = Math.min(100, Math.max(1, parseInt(req.query.limite, 10) || 20));
      const filtro = {};
      if (req.query.buscar) {
        filtro[campoTexto] = { $regex: patronBusqueda(req.query.buscar), $options: 'i' };
      }
      if (req.query.activo !== undefined) {
        filtro[campoActivo] = req.query.activo === 'true';
      }
      let consulta = Modelo.find(filtro).sort(orden).skip((pagina - 1) * limite).limit(limite);
      poblar.forEach(p => { consulta = consulta.populate(p.ruta, p.campos); });
      const [datos, total] = await Promise.all([consulta.lean(), Modelo.countDocuments(filtro)]);
      res.json({ ok: true, pagina, limite, total, paginas: Math.ceil(total / limite), datos });
    } catch (e) { next(e); }
  }

  async function obtener(req, res, next) {
    try {
      let consulta = Modelo.findById(req.params.id);
      poblar.forEach(p => { consulta = consulta.populate(p.ruta, p.campos); });
      const doc = await consulta.lean();
      if (!doc) return res.status(404).json({ ok: false, error: 'Registro no encontrado' });
      res.json({ ok: true, dato: doc });
    } catch (e) { next(e); }
  }

  async function crear(req, res, next) {
    try {
      const doc = await Modelo.create(req.body);
      res.locals.accion = `Alta en ${Modelo.collection.name}`;
      res.status(201).json({ ok: true, dato: doc });
    } catch (e) {
      if (e.code === 11000) {
        return res.status(409).json({ ok: false, error: 'Ya existe un registro con ese identificador único' });
      }
      next(e);
    }
  }

  async function actualizar(req, res, next) {
    try {
      // Con lista de campos editables, cualquier otro campo del cuerpo se descarta:
      // en productos, el stock solo cambia por movimientos o ventas y compras.
      const cambios = camposEditables
        ? Object.fromEntries(Object.entries(req.body).filter(([k]) => camposEditables.includes(k)))
        : req.body;
      const doc = await Modelo.findByIdAndUpdate(req.params.id, cambios, { new: true, runValidators: true });
      if (!doc) return res.status(404).json({ ok: false, error: 'Registro no encontrado' });
      res.locals.accion = `Modificación en ${Modelo.collection.name}`;
      res.json({ ok: true, dato: doc });
    } catch (e) { next(e); }
  }

  /** Baja logica: el registro se desactiva y conserva su trazabilidad historica. */
  async function eliminar(req, res, next) {
    try {
      const doc = await Modelo.findByIdAndUpdate(req.params.id, { [campoActivo]: false }, { new: true });
      if (!doc) return res.status(404).json({ ok: false, error: 'Registro no encontrado' });
      res.locals.accion = `Baja lógica en ${Modelo.collection.name}`;
      res.json({ ok: true, mensaje: 'Registro desactivado', dato: doc });
    } catch (e) { next(e); }
  }

  /** Reactivacion: deshace la baja logica; el registro vuelve con su historial intacto. */
  async function reactivar(req, res, next) {
    try {
      const doc = await Modelo.findByIdAndUpdate(req.params.id, { [campoActivo]: true }, { new: true });
      if (!doc) return res.status(404).json({ ok: false, error: 'Registro no encontrado' });
      res.locals.accion = `Reactivación en ${Modelo.collection.name}`;
      res.json({ ok: true, mensaje: 'Registro reactivado', dato: doc });
    } catch (e) { next(e); }
  }

  return { listar, obtener, crear, actualizar, eliminar, reactivar };
}

module.exports = { crearControlador };
