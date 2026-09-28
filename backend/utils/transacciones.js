const mongoose = require('mongoose');
const Producto = require('../models/Producto');
const Proveedor = require('../models/Proveedor');
const Movimiento = require('../models/Movimiento');
const Transaccion = require('../models/Transaccion');

/**
 * Servicio unico del carro de compra y venta.
 * Lo usan la API y la carga inicial de datos, de modo que una venta registrada
 * por cualquiera de los dos caminos deja exactamente el mismo rastro: stock
 * actualizado, comprobante con folio y un movimiento por linea.
 */

const TASA_IVA = 0.19;
const MAX_LINEAS = 50;
const MAX_UNIDADES = 10000;
const MAX_COSTO = 100000000;

class ErrorNegocio extends Error {
  constructor(status, mensaje, detalle) {
    super(mensaje);
    this.status = status;
    this.detalle = detalle;
  }
}

/** Los precios se expresan con IVA incluido; el comprobante desglosa neto e IVA. */
function desglosar(total) {
  const neto = Math.round(total / (1 + TASA_IVA));
  return { neto, iva: total - neto, total };
}

/** Une las lineas repetidas de un mismo producto y valida cada cantidad. */
function normalizar(lineas) {
  if (!Array.isArray(lineas)) throw new ErrorNegocio(400, 'El carro no trae líneas');
  const mapa = new Map();
  for (const l of lineas) {
    const id = String(l && l.id_producto);
    const cantidad = Number(l && l.cantidad);
    if (!mongoose.isValidObjectId(id)) throw new ErrorNegocio(400, 'Identificador de producto no válido');
    if (!Number.isInteger(cantidad) || cantidad < 1 || cantidad > MAX_UNIDADES) {
      throw new ErrorNegocio(400, `Cada cantidad debe ser un entero entre 1 y ${MAX_UNIDADES}`);
    }
    const previa = mapa.get(id);
    if (previa) previa.cantidad += cantidad;
    else mapa.set(id, { id_producto: id, cantidad, costo_unitario: l.costo_unitario });
  }
  const unidas = [...mapa.values()];
  if (unidas.length < 1 || unidas.length > MAX_LINEAS) {
    throw new ErrorNegocio(400, `El carro debe tener entre 1 y ${MAX_LINEAS} productos distintos`);
  }
  if (unidas.some(l => l.cantidad > MAX_UNIDADES)) {
    throw new ErrorNegocio(400, `La cantidad total de un producto no puede superar ${MAX_UNIDADES} unidades`);
  }
  return unidas;
}

/** Folio correlativo por tipo: V-000001 para ventas, C-000001 para compras. */
async function siguienteFolio(tipo) {
  const prefijo = tipo === 'Venta' ? 'V' : 'C';
  const ultima = await Transaccion.findOne({ folio: new RegExp('^' + prefijo + '-') })
    .sort({ folio: -1 }).select('folio').lean();
  const numero = ultima ? parseInt(ultima.folio.slice(2), 10) + 1 : 1;
  return `${prefijo}-${String(numero).padStart(6, '0')}`;
}

/** Deshace, en orden inverso, las lineas de stock que alcanzaron a aplicarse. */
async function revertir(aplicadas) {
  for (const { id_producto, delta } of aplicadas.slice().reverse()) {
    await Producto.updateOne({ _id: id_producto }, { $inc: { stock_actual: -delta } });
  }
}

/**
 * Confirma una venta o una compra con todas sus lineas: todo o nada.
 * Si una linea no se puede aplicar, se revierten las que ya se aplicaron y el
 * stock queda exactamente como estaba antes de la operacion.
 *   datos   = { tipo, detalle: [{ id_producto, cantidad, costo_unitario }],
 *               cliente: { nombre, rut }, id_proveedor, observacion }
 *   opciones.fecha solo la usa la carga inicial para fechar el historial.
 */
async function confirmar(datos, usuario, opciones = {}) {
  const tipo = datos && datos.tipo;
  if (tipo !== 'Venta' && tipo !== 'Compra') throw new ErrorNegocio(400, 'La operación debe ser Venta o Compra');
  const esVenta = tipo === 'Venta';
  const lineas = normalizar(datos.detalle);
  const fecha = opciones.fecha || new Date();

  // 1) Los productos deben existir y estar activos.
  const ids = lineas.map(l => l.id_producto);
  const productos = await Producto.find({ _id: { $in: ids } }).lean();
  const porId = new Map(productos.map(p => [String(p._id), p]));
  const faltan = ids.filter(id => !porId.has(id));
  if (faltan.length) throw new ErrorNegocio(404, 'Producto no encontrado en el catálogo', { productos: faltan });
  const inactivos = productos.filter(p => !p.activo).map(p => p.sku);
  if (inactivos.length) {
    throw new ErrorNegocio(409,
      `Producto inactivo: no se puede ${esVenta ? 'vender' : 'comprar'} hasta reactivarlo (${inactivos.join(', ')})`,
      { inactivos });
  }

  // 2) La compra exige un proveedor vigente.
  let proveedor = null;
  if (!esVenta) {
    if (!datos.id_proveedor || !mongoose.isValidObjectId(datos.id_proveedor)) {
      throw new ErrorNegocio(400, 'La compra requiere el proveedor');
    }
    proveedor = await Proveedor.findById(datos.id_proveedor).lean();
    if (!proveedor) throw new ErrorNegocio(404, 'Proveedor no encontrado');
    if (!proveedor.activo) throw new ErrorNegocio(409, 'El proveedor está dado de baja');
  }

  // 3) Venta: se revisan todas las lineas antes de tocar el stock, para informar
  //    de una sola vez cada producto que no alcanza.
  if (esVenta) {
    const sinStock = lineas
      .filter(l => porId.get(l.id_producto).stock_actual < l.cantidad)
      .map(l => {
        const p = porId.get(l.id_producto);
        return { sku: p.sku, disponible: p.stock_actual, solicitado: l.cantidad };
      });
    if (sinStock.length) {
      throw new ErrorNegocio(409, 'Stock insuficiente: ' + sinStock
        .map(s => `${s.sku} (disponible ${s.disponible}, solicitado ${s.solicitado})`).join('; '),
      { sin_stock: sinStock });
    }
  }

  // 4) Precio: en la venta lo fija el catalogo del servidor y se ignora cualquier
  //    precio que envie el navegador; en la compra es el costo informado.
  const detalle = lineas.map(l => {
    const p = porId.get(l.id_producto);
    let precio = p.precio;
    const costo = l.costo_unitario;
    if (!esVenta && costo !== undefined && costo !== null && costo !== '') {
      precio = Number(costo);
      if (!Number.isFinite(precio) || precio < 0 || precio > MAX_COSTO) {
        throw new ErrorNegocio(400, 'Costo unitario no válido');
      }
      precio = Math.round(precio);
    }
    return {
      id_producto: p._id, sku: p.sku, nombre: p.nombre, cantidad: l.cantidad,
      precio_unitario: precio, subtotal: precio * l.cantidad,
      stock_critico: p.stock_critico, id_proveedor_producto: p.id_proveedor
    };
  });

  // 5) Stock linea por linea. En la venta la condicion de existencias viaja dentro
  //    del filtro de la actualizacion: si otra operacion tomo las unidades entre la
  //    revision y este paso, la linea no se aplica y se revierte todo el carro.
  const aplicadas = [];
  try {
    for (const linea of detalle) {
      const delta = esVenta ? -linea.cantidad : linea.cantidad;
      const filtro = { _id: linea.id_producto, activo: true };
      if (esVenta) filtro.stock_actual = { $gte: linea.cantidad };
      const actualizado = await Producto.findOneAndUpdate(filtro, { $inc: { stock_actual: delta } },
        { new: true, projection: { stock_actual: 1 } });
      if (!actualizado) {
        throw new ErrorNegocio(409,
          `Stock insuficiente para ${linea.sku}: otra operación tomó esas unidades mientras se confirmaba el carro`,
          { sku: linea.sku });
      }
      aplicadas.push({ id_producto: linea.id_producto, delta });
      linea.stock_resultante = actualizado.stock_actual;
    }
  } catch (e) {
    await revertir(aplicadas);
    throw e;
  }

  // 6) Comprobante con folio correlativo y un movimiento por linea enlazado a el.
  let transaccion = null;
  try {
    const total = detalle.reduce((s, l) => s + l.subtotal, 0);
    const { neto, iva } = desglosar(total);
    const cliente = esVenta
      ? { nombre: (datos.cliente && datos.cliente.nombre) || 'Cliente sin identificar',
          rut: (datos.cliente && datos.cliente.rut) || '' }
      : { nombre: '', rut: '' };

    for (let intento = 0; intento < 5 && !transaccion; intento++) {
      try {
        transaccion = await Transaccion.create({
          folio: await siguienteFolio(tipo),
          tipo,
          detalle: detalle.map(l => ({
            id_producto: l.id_producto, sku: l.sku, nombre: l.nombre, cantidad: l.cantidad,
            precio_unitario: l.precio_unitario, subtotal: l.subtotal, stock_resultante: l.stock_resultante
          })),
          cliente,
          id_proveedor: proveedor ? proveedor._id : null,
          razon_social: proveedor ? proveedor.razon_social : '',
          unidades: detalle.reduce((s, l) => s + l.cantidad, 0),
          neto, iva, total,
          id_usuario: usuario._id,
          observacion: datos.observacion || '',
          fecha_timestamp: fecha
        });
      } catch (e) {
        // Dos confirmaciones simultaneas pueden calcular el mismo folio: el indice
        // unico rechaza la segunda y esta pide el siguiente numero.
        if (e.code !== 11000) throw e;
      }
    }
    if (!transaccion) throw new ErrorNegocio(409, 'No fue posible asignar un folio; reintente la operación');

    await Movimiento.insertMany(detalle.map(l => ({
      id_producto: l.id_producto,
      id_usuario: usuario._id,
      id_proveedor: proveedor ? proveedor._id : l.id_proveedor_producto,
      id_transaccion: transaccion._id,
      tipo_operacion: esVenta ? 'Salida' : 'Entrada',
      cantidad: l.cantidad,
      stock_resultante: l.stock_resultante,
      observacion: `${tipo} ${transaccion.folio}`,
      fecha_timestamp: fecha
    })));
  } catch (e) {
    if (transaccion) {
      await Movimiento.deleteMany({ id_transaccion: transaccion._id });
      await Transaccion.deleteOne({ _id: transaccion._id });
    }
    await revertir(aplicadas);
    throw e;
  }

  const criticos = detalle
    .filter(l => l.stock_resultante <= l.stock_critico)
    .map(l => ({ sku: l.sku, nombre: l.nombre, stock_actual: l.stock_resultante }));

  return { transaccion, criticos };
}

module.exports = { confirmar, desglosar, ErrorNegocio, TASA_IVA };
