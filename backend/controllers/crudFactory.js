/**
 * Fabrica de controladores CRUD.
 * Los tres modulos de catalogo (productos, proveedores, categorias) comparten
 * la misma logica de paginacion, filtrado y borrado logico; solo cambian el
 * modelo y los campos buscables.
 */
function crearControlador(Modelo, opciones = {}) {
  const { campoTexto = 'nombre', poblar = [], campoActivo = 'activo' } = opciones;

  async function listar(req, res, next) {
    try {
      const pagina = Math.max(1, parseInt(req.query.pagina, 10) || 1);
      const limite = Math.min(100, Math.max(1, parseInt(req.query.limite, 10) || 20));
      const filtro = {};
      if (req.query.buscar) {
        filtro[campoTexto] = { $regex: String(req.query.buscar).slice(0, 60), $options: 'i' };
      }
      if (req.query.activo !== undefined) {
        filtro[campoActivo] = req.query.activo === 'true';
      }
      let consulta = Modelo.find(filtro).sort({ creado_en: -1 }).skip((pagina - 1) * limite).limit(limite);
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
        return res.status(409).json({ ok: false, error: 'Ya existe un registro con ese identificador unico' });
      }
      next(e);
    }
  }

  async function actualizar(req, res, next) {
    try {
      const doc = await Modelo.findByIdAndUpdate(req.params.id, req.body, { new: true, runValidators: true });
      if (!doc) return res.status(404).json({ ok: false, error: 'Registro no encontrado' });
      res.locals.accion = `Modificacion en ${Modelo.collection.name}`;
      res.json({ ok: true, dato: doc });
    } catch (e) { next(e); }
  }

  /** Baja logica: el registro se desactiva y conserva su trazabilidad historica. */
  async function eliminar(req, res, next) {
    try {
      const doc = await Modelo.findByIdAndUpdate(req.params.id, { [campoActivo]: false }, { new: true });
      if (!doc) return res.status(404).json({ ok: false, error: 'Registro no encontrado' });
      res.locals.accion = `Baja logica en ${Modelo.collection.name}`;
      res.json({ ok: true, mensaje: 'Registro desactivado', dato: doc });
    } catch (e) { next(e); }
  }

  return { listar, obtener, crear, actualizar, eliminar };
}

module.exports = { crearControlador };
