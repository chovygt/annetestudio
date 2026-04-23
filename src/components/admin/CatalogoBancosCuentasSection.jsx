import { useCallback, useEffect, useMemo, useState } from 'react'
import { Button } from 'primereact/button'
import { Column } from 'primereact/column'
import { ConfirmDialog, confirmDialog } from 'primereact/confirmdialog'
import { DataTable } from 'primereact/datatable'
import { Dialog } from 'primereact/dialog'
import { Dropdown } from 'primereact/dropdown'
import { InputNumber } from 'primereact/inputnumber'
import { InputText } from 'primereact/inputtext'
import { InputTextarea } from 'primereact/inputtextarea'
import { Tag } from 'primereact/tag'
import { supabase } from '../../lib/supabaseClient'
import { adminInputNumberCurrencyProps } from '../../lib/adminFormatMoney.js'

const EMPTY_BANCO = {
  codigo: '',
  nombre: '',
  activo: true,
  orden: 0,
}

const EMPTY_CUENTA = {
  banco_id: null,
  nombre: '',
  moneda: 'GTQ',
  numero_mascara: '',
  activa: true,
  comentario: '',
}

export default function CatalogoBancosCuentasSection({ onMessage }) {
  const [bancos, setBancos] = useState([])
  const [cuentas, setCuentas] = useState([])
  const [loadingB, setLoadingB] = useState(false)
  const [loadingC, setLoadingC] = useState(false)
  const [openBanco, setOpenBanco] = useState(false)
  const [openCuenta, setOpenCuenta] = useState(false)
  const [editingBancoId, setEditingBancoId] = useState(null)
  const [editingCuentaId, setEditingCuentaId] = useState(null)
  const [saving, setSaving] = useState(false)
  const [formBanco, setFormBanco] = useState(EMPTY_BANCO)
  const [formCuenta, setFormCuenta] = useState(EMPTY_CUENTA)

  const bancosOptions = useMemo(
    () => bancos.map((b) => ({ label: b.nombre, value: b.id })),
    [bancos]
  )

  const refreshBancos = useCallback(async () => {
    setLoadingB(true)
    const { data, error } = await supabase
      .from('bancos')
      .select('*')
      .order('orden', { ascending: true })
      .order('nombre', { ascending: true })
    setLoadingB(false)
    if (error) {
      onMessage?.({ ok: false, text: `No se pudo cargar bancos: ${error.message}` })
      return
    }
    setBancos(data || [])
  }, [onMessage])

  const refreshCuentas = useCallback(async () => {
    setLoadingC(true)
    const { data, error } = await supabase
      .from('cuentas_bancarias')
      .select('*, bancos ( id, nombre )')
      .order('nombre', { ascending: true })
    setLoadingC(false)
    if (error) {
      onMessage?.({ ok: false, text: `No se pudo cargar cuentas: ${error.message}` })
      return
    }
    setCuentas(data || [])
  }, [onMessage])

  useEffect(() => {
    refreshBancos()
    refreshCuentas()
  }, [refreshBancos, refreshCuentas])

  function openCreateBanco() {
    setEditingBancoId(null)
    setFormBanco(EMPTY_BANCO)
    setOpenBanco(true)
  }

  function openEditBanco(row) {
    setEditingBancoId(row.id)
    setFormBanco({
      codigo: row.codigo || '',
      nombre: row.nombre || '',
      activo: Boolean(row.activo),
      orden: Number(row.orden) || 0,
    })
    setOpenBanco(true)
  }

  function openCreateCuenta() {
    if (bancos.length === 0) {
      onMessage?.({ ok: false, text: 'Primero crea al menos un banco.' })
      return
    }
    setEditingCuentaId(null)
    setFormCuenta(EMPTY_CUENTA)
    setOpenCuenta(true)
  }

  function openEditCuenta(row) {
    setEditingCuentaId(row.id)
    setFormCuenta({
      banco_id: row.banco_id,
      nombre: row.nombre || '',
      moneda: row.moneda || 'GTQ',
      numero_mascara: row.numero_mascara || '',
      activa: Boolean(row.activa),
      comentario: row.comentario || '',
    })
    setOpenCuenta(true)
  }

  async function saveBanco() {
    if (!String(formBanco.nombre || '').trim()) {
      onMessage?.({ ok: false, text: 'El nombre del banco es obligatorio.' })
      return
    }
    const payload = {
      codigo: String(formBanco.codigo || '').trim() || null,
      nombre: String(formBanco.nombre).trim(),
      activo: Boolean(formBanco.activo),
      orden: Number(formBanco.orden) || 0,
    }
    setSaving(true)
    const { error } = editingBancoId
      ? await supabase.from('bancos').update(payload).eq('id', editingBancoId)
      : await supabase.from('bancos').insert(payload)
    setSaving(false)
    if (error) {
      onMessage?.({ ok: false, text: error.message })
      return
    }
    onMessage?.({ ok: true, text: editingBancoId ? 'Banco actualizado.' : 'Banco creado.' })
    setOpenBanco(false)
    refreshBancos()
  }

  async function saveCuenta() {
    if (!formCuenta.banco_id) {
      onMessage?.({ ok: false, text: 'Selecciona un banco.' })
      return
    }
    if (!String(formCuenta.nombre || '').trim()) {
      onMessage?.({ ok: false, text: 'El nombre o alias de la cuenta es obligatorio.' })
      return
    }
    const mon = String(formCuenta.moneda || 'GTQ')
      .trim()
      .toUpperCase()
      .slice(0, 3)
    if (mon.length !== 3) {
      onMessage?.({ ok: false, text: 'Moneda: usa un código de 3 letras (ej. GTQ).' })
      return
    }
    const payload = {
      banco_id: formCuenta.banco_id,
      nombre: String(formCuenta.nombre).trim(),
      moneda: mon,
      numero_mascara: String(formCuenta.numero_mascara || '').trim() || null,
      activa: Boolean(formCuenta.activa),
      comentario: String(formCuenta.comentario || '').trim() || null,
    }
    setSaving(true)
    const { error } = editingCuentaId
      ? await supabase.from('cuentas_bancarias').update(payload).eq('id', editingCuentaId)
      : await supabase.from('cuentas_bancarias').insert(payload)
    setSaving(false)
    if (error) {
      onMessage?.({ ok: false, text: error.message })
      return
    }
    onMessage?.({ ok: true, text: editingCuentaId ? 'Cuenta actualizada.' : 'Cuenta creada.' })
    setOpenCuenta(false)
    refreshCuentas()
  }

  function askDeleteBanco(row) {
    confirmDialog({
      header: 'Eliminar banco',
      message: `¿Eliminar "${row.nombre}"? No podrá haber cuentas asociadas.`,
      icon: 'pi pi-exclamation-triangle',
      acceptLabel: 'Eliminar',
      rejectLabel: 'Cancelar',
      acceptClassName: 'p-button-danger',
      accept: async () => {
        const { error } = await supabase.from('bancos').delete().eq('id', row.id)
        if (error) {
          onMessage?.({
            ok: false,
            text: error.message.includes('foreign key')
              ? 'No se puede eliminar: hay cuentas u otros registros vinculados.'
              : error.message,
          })
          return
        }
        onMessage?.({ ok: true, text: 'Banco eliminado.' })
        refreshBancos()
        refreshCuentas()
      },
    })
  }

  function askDeleteCuenta(row) {
    confirmDialog({
      header: 'Eliminar cuenta',
      message: `¿Eliminar la cuenta "${row.nombre}"? No debe tener movimientos asociados.`,
      icon: 'pi pi-exclamation-triangle',
      acceptLabel: 'Eliminar',
      rejectLabel: 'Cancelar',
      acceptClassName: 'p-button-danger',
      accept: async () => {
        const { error } = await supabase.from('cuentas_bancarias').delete().eq('id', row.id)
        if (error) {
          onMessage?.({
            ok: false,
            text: error.message.includes('foreign key')
              ? 'No se puede eliminar: hay movimientos u otros datos vinculados.'
              : error.message,
          })
          return
        }
        onMessage?.({ ok: true, text: 'Cuenta eliminada.' })
        refreshCuentas()
      },
    })
  }

  return (
    <div className="admin-panel">
      <ConfirmDialog />
      <h2>Bancos y cuentas bancarias</h2>
      <p className="lead">Catálogo de instituciones y cuentas operativas (para pagos, cobros y movimientos).</p>

      <h3 className="admin-report-subtitle" style={{ marginTop: '1.25rem' }}>
        Bancos
      </h3>
      <div className="admin-catalog-head">
        <span />
        <Button type="button" icon="pi pi-refresh" label="Actualizar" outlined severity="secondary" onClick={refreshBancos} />
        <Button type="button" icon="pi pi-plus" label="Nuevo banco" onClick={openCreateBanco} />
      </div>
      <div className="admin-catalog-card" style={{ marginTop: '0.5rem' }}>
        <DataTable
          value={bancos}
          dataKey="id"
          loading={loadingB}
          paginator
          rows={10}
          size="small"
          emptyMessage="No hay bancos registrados."
        >
          <Column field="codigo" header="Código" sortable style={{ width: '7rem' }} />
          <Column field="nombre" header="Nombre" sortable />
          <Column
            header="Estado"
            body={(r) => <Tag severity={r.activo ? 'success' : 'danger'} value={r.activo ? 'Activo' : 'Inactivo'} />}
            style={{ width: '7rem' }}
          />
          <Column field="orden" header="Orden" style={{ width: '5rem' }} />
          <Column
            style={{ width: '6.5rem' }}
            body={(row) => (
              <div className="admin-catalog-actions">
                <Button type="button" icon="pi pi-pencil" rounded text severity="secondary" onClick={() => openEditBanco(row)} />
                <Button type="button" icon="pi pi-trash" rounded text severity="danger" onClick={() => askDeleteBanco(row)} />
              </div>
            )}
          />
        </DataTable>
      </div>

      <h3 className="admin-report-subtitle" style={{ marginTop: '1.5rem' }}>
        Cuentas bancarias
      </h3>
      <div className="admin-catalog-head">
        <span />
        <Button type="button" icon="pi pi-refresh" label="Actualizar" outlined severity="secondary" onClick={refreshCuentas} />
        <Button type="button" icon="pi pi-plus" label="Nueva cuenta" onClick={openCreateCuenta} />
      </div>
      <div className="admin-catalog-card" style={{ marginTop: '0.5rem' }}>
        <DataTable
          value={cuentas}
          dataKey="id"
          loading={loadingC}
          paginator
          rows={10}
          size="small"
          emptyMessage="No hay cuentas registradas."
        >
          <Column header="Banco" body={(r) => r.bancos?.nombre || '—'} />
          <Column field="nombre" header="Nombre / alias" sortable />
          <Column field="moneda" header="Mon." style={{ width: '5rem' }} />
          <Column field="numero_mascara" header="Máscara" style={{ width: '8rem' }} body={(r) => r.numero_mascara || '—'} />
          <Column
            header="Estado"
            body={(r) => <Tag severity={r.activa ? 'success' : 'danger'} value={r.activa ? 'Activa' : 'Inactiva'} />}
            style={{ width: '7rem' }}
          />
          <Column
            style={{ width: '6.5rem' }}
            body={(row) => (
              <div className="admin-catalog-actions">
                <Button type="button" icon="pi pi-pencil" rounded text severity="secondary" onClick={() => openEditCuenta(row)} />
                <Button type="button" icon="pi pi-trash" rounded text severity="danger" onClick={() => askDeleteCuenta(row)} />
              </div>
            )}
          />
        </DataTable>
      </div>

      <Dialog
        header={editingBancoId ? 'Editar banco' : 'Nuevo banco'}
        visible={openBanco}
        style={{ width: 'min(32rem, 94vw)' }}
        onHide={() => setOpenBanco(false)}
        modal
      >
        <div className="admin-catalog-form">
          <label htmlFor="b-codigo">Código (opcional)</label>
          <InputText
            id="b-codigo"
            value={formBanco.codigo}
            onChange={(e) => setFormBanco((s) => ({ ...s, codigo: e.target.value }))}
            placeholder="ej. BAM"
          />
          <label htmlFor="b-nombre">Nombre *</label>
          <InputText
            id="b-nombre"
            value={formBanco.nombre}
            onChange={(e) => setFormBanco((s) => ({ ...s, nombre: e.target.value }))}
          />
          <label htmlFor="b-orden">Orden</label>
          <InputNumber
            id="b-orden"
            value={formBanco.orden}
            onValueChange={(e) => setFormBanco((s) => ({ ...s, orden: e.value ?? 0 }))}
            useGrouping={false}
          />
          <label htmlFor="b-activo" className="admin-catalog-check">
            <input
              id="b-activo"
              type="checkbox"
              checked={formBanco.activo}
              onChange={(e) => setFormBanco((s) => ({ ...s, activo: e.target.checked }))}
            />
            Activo
          </label>
        </div>
        <div className="admin-catalog-dialog-actions">
          <Button type="button" label="Cancelar" severity="secondary" text onClick={() => setOpenBanco(false)} />
          <Button type="button" label="Guardar" icon="pi pi-check" loading={saving} onClick={saveBanco} />
        </div>
      </Dialog>

      <Dialog
        header={editingCuentaId ? 'Editar cuenta' : 'Nueva cuenta'}
        visible={openCuenta}
        style={{ width: 'min(36rem, 94vw)' }}
        onHide={() => setOpenCuenta(false)}
        modal
      >
        <div className="admin-catalog-form">
          <label htmlFor="c-banco">Banco *</label>
          <Dropdown
            id="c-banco"
            value={formCuenta.banco_id}
            options={bancosOptions}
            onChange={(e) => setFormCuenta((s) => ({ ...s, banco_id: e.value }))}
            filter
            placeholder="Selecciona banco"
            className="w-full"
          />
          <label htmlFor="c-nombre">Nombre o alias *</label>
          <InputText
            id="c-nombre"
            value={formCuenta.nombre}
            onChange={(e) => setFormCuenta((s) => ({ ...s, nombre: e.target.value }))}
            placeholder="ej. Cuenta corriente Q"
          />
          <label htmlFor="c-moneda">Moneda (ISO)</label>
          <InputText
            id="c-moneda"
            value={formCuenta.moneda}
            onChange={(e) => setFormCuenta((s) => ({ ...s, moneda: e.target.value }))}
            maxLength={3}
            placeholder="GTQ"
          />
          <label htmlFor="c-mask">Últimos dígitos / máscara (opcional)</label>
          <InputText
            id="c-mask"
            value={formCuenta.numero_mascara}
            onChange={(e) => setFormCuenta((s) => ({ ...s, numero_mascara: e.target.value }))}
            placeholder="ej. 1234"
          />
          <label htmlFor="c-coment">Comentario (opcional)</label>
          <InputTextarea
            id="c-coment"
            rows={2}
            value={formCuenta.comentario}
            onChange={(e) => setFormCuenta((s) => ({ ...s, comentario: e.target.value }))}
          />
          <label htmlFor="c-activa" className="admin-catalog-check">
            <input
              id="c-activa"
              type="checkbox"
              checked={formCuenta.activa}
              onChange={(e) => setFormCuenta((s) => ({ ...s, activa: e.target.checked }))}
            />
            Activa
          </label>
        </div>
        <div className="admin-catalog-dialog-actions">
          <Button type="button" label="Cancelar" severity="secondary" text onClick={() => setOpenCuenta(false)} />
          <Button type="button" label="Guardar" icon="pi pi-check" loading={saving} onClick={saveCuenta} />
        </div>
      </Dialog>
    </div>
  )
}
