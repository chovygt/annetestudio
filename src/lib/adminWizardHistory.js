import { useEffect, useRef } from 'react'

/**
 * Marca en history.state para emparejar push/peel entre asistentes admin.
 * Evita que el botón “atrás” del móvil cierre la app o salte de sección en lugar del modal.
 */
export const ADMIN_MODAL_HISTORY_MARK = {
  compraWizard: 'compra-wizard',
  pagoProveedorWizard: 'pago-proveedor-wizard',
  ventaWizard: 'venta-wizard',
  cobroWizard: 'cobro-wizard',
}

export function pushAdminModalHistory(mark) {
  if (typeof window === 'undefined') return
  window.history.pushState({ tvAdminModal: mark }, '')
}

/**
 * Quita la entrada sintética del historial (Cancelar / guardado OK).
 * Debe ir acompañado de ignorePopRef para que el listener de popstate no duplique el cierre.
 */
export function peelAdminModalHistory(mark, ignorePopRef) {
  if (typeof window === 'undefined') return
  if (window.history.state?.tvAdminModal !== mark) return
  if (ignorePopRef) ignorePopRef.current = true
  window.history.back()
}

/**
 * Si el usuario usa el botón atrás del sistema mientras el asistente está abierto,
 * solo cerramos el modal (el navegador ya hizo pop de nuestra entrada).
 */
export function useAdminModalPopstate({ isOpen, onPopClose }) {
  const ignorePopRef = useRef(false)
  const isOpenRef = useRef(isOpen)
  const onPopCloseRef = useRef(onPopClose)

  useEffect(() => {
    isOpenRef.current = isOpen
    onPopCloseRef.current = onPopClose
  }, [isOpen, onPopClose])

  useEffect(() => {
    function onPop() {
      if (ignorePopRef.current) {
        ignorePopRef.current = false
        return
      }
      if (isOpenRef.current) {
        onPopCloseRef.current()
      }
    }
    window.addEventListener('popstate', onPop)
    return () => window.removeEventListener('popstate', onPop)
  }, [])

  return ignorePopRef
}
