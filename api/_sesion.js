/**
 * Verificación de la sesión del panel.
 *
 * Todas las APIs del panel (blog, vuelos, revolving, segunda oportunidad y
 * seguridad) comprueban aquí la misma sesión, de modo que quien entra en una
 * sección entra en todas sin volver a identificarse.
 *
 * Desde la versión con verificación en dos pasos, la sesión ya no es un token
 * firmado que vale hasta que caduca: se guarda en el servidor (Redis), y así
 * se puede cerrar desde el panel, caduca por inactividad y deja de valer en
 * cuanto se cambia la contraseña. El detalle está en _seguridad.js.
 *
 * Uso en cada API (es asíncrona):
 *   const control = await exigirSesion(req);
 *   if (control.error) return res.status(control.estado).json({ error: control.error });
 *   control.sesion.correo · control.sesion.nombre
 */

export { exigirSesion } from "./_seguridad.js";
