import { useCallback, useEffect, useMemo, useState } from 'react'
import { Card } from 'primereact/card'
import { Chart } from 'primereact/chart'
import { Column } from 'primereact/column'
import { DataTable } from 'primereact/datatable'
import { Message } from 'primereact/message'
import { Tag } from 'primereact/tag'
import {
  adminDoughnutOptions,
  adminCurrencyBarOptions,
  adminStackedCurrencyBarOptions,
  barMoneyDatasetFromBuckets,
} from '../../lib/adminChartTheme.js'
import { lastNMonthMoneyBuckets, sumMoneyIntoMonthBuckets } from '../../lib/adminMoneyBuckets.js'
import { supabase } from '../../lib/supabaseClient.js'
import { formatMoneyGtq } from '../../lib/adminFormatMoney.js'

function parseDateOnly(s) {
  if (!s) return null
  if (s instanceof Date) return s
  const d = new Date(s)
  return Number.isNaN(d.getTime()) ? null : d
}

function addDays(d, days) {
  const x = new Date(d)
  x.setDate(x.getDate() + Number(days || 0))
  return x
}

function startOfToday() {
  const t = new Date()
  t.setHours(0, 0, 0, 0)
  return t
}

function formatDate(value) {
  if (!value) return '—'
  const d = value instanceof Date ? value : new Date(value)
  return Number.isNaN(d.getTime()) ? '—' : d.toLocaleDateString('es')
}

export default function ComprasCuentaPorPagarReport() {
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState(null)
  const [rows, setRows] = useState([])

  const load = useCallback(async () => {
    setLoading(true)
    setError(null)
    const { data, error } = await supabase
      .from('compras')
      .select(
        `
        id,
        fecha_compra,
        dias_credito,
        created_at,
        proveedores ( nombre ),
        compras_detalle ( monto )
      `
      )
      .order('fecha_compra', { ascending: true })
    setLoading(false)
    if (error) {
      setError(error.message)
      return
    }
    const enriched = (data || []).map((c) => {
      const fecha = parseDateOnly(c.fecha_compra)
      const vencimiento = fecha ? addDays(fecha, c.dias_credito || 0) : null
      const total = (c.compras_detalle || []).reduce((a, d) => a + Number(d.monto || 0), 0)
      const hoy = startOfToday()
      const estado = vencimiento && vencimiento < hoy ? 'vencido' : 'por_vencer'
      return {
        id: c.id,
        proveedor: c.proveedores?.nombre || '—',
        fecha_compra: fecha,
        dias_credito: c.dias_credito ?? 0,
        vencimiento,
        total,
        estado,
      }
    })
    setRows(enriched)
  }, [])

  useEffect(() => {
    load()
  }, [load])

  const totales = useMemo(() => {
    const total = rows.reduce((a, r) => a + r.total, 0)
    const vencido = rows.filter((r) => r.estado === 'vencido').reduce((a, r) => a + r.total, 0)
    const porVencer = rows.filter((r) => r.estado === 'por_vencer').reduce((a, r) => a + r.total, 0)
    return { total, vencido, porVencer }
  }, [rows])

  const bucketsPorVencimiento = useMemo(() => {
    const b = lastNMonthMoneyBuckets(12)
    sumMoneyIntoMonthBuckets(
      b,
      rows,
      (r) => r.vencimiento,
      (r) => r.total
    )
    return b
  }, [rows])

  const bucketsVencidoVsProximo = useMemo(() => {
    const ahora = new Date()
    const meses = 6
    const out = []
    for (let i = meses - 1; i >= 0; i -= 1) {
      const d = new Date(ahora.getFullYear(), ahora.getMonth() - i, 1)
      const key = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`
      const label = d.toLocaleDateString('es', { month: 'short', year: '2-digit' })
      out.push({ key, label, vencido: 0, porVencer: 0 })
    }
    const map = new Map(out.map((x) => [x.key, x]))
    for (const r of rows) {
      if (!r.vencimiento) continue
      const v = r.vencimiento
      const key = `${v.getFullYear()}-${String(v.getMonth() + 1).padStart(2, '0')}`
      const cell = map.get(key)
      if (!cell) continue
      if (r.estado === 'vencido') cell.vencido += r.total
      else cell.porVencer += r.total
    }
    return out
  }, [rows])

  const chartMontoPorMesVenc = useMemo(
    () =>
      barMoneyDatasetFromBuckets(
        bucketsPorVencimiento,
        'Cuenta por pagar (vencimiento)',
        'rgba(122, 143, 126, 0.65)',
        '#556b5f'
      ),
    [bucketsPorVencimiento]
  )

  const chartVencidoStack = useMemo(() => {
    return {
      labels: bucketsVencidoVsProximo.map((x) => x.label),
      datasets: [
        {
          label: 'Vencido',
          data: bucketsVencidoVsProximo.map((x) => x.vencido),
          backgroundColor: 'rgba(181, 101, 76, 0.75)',
          borderColor: '#8c4a38',
          borderWidth: 1,
          borderRadius: 6,
        },
        {
          label: 'Por vencer (mes venc.)',
          data: bucketsVencidoVsProximo.map((x) => x.porVencer),
          backgroundColor: 'rgba(122, 143, 126, 0.5)',
          borderColor: '#556b5f',
          borderWidth: 1,
          borderRadius: 6,
        },
      ],
    }
  }, [bucketsVencidoVsProximo])

  const estadosData = useMemo(() => {
    return {
      labels: ['Vencido', 'Por vencer'],
      datasets: [
        {
          data: [totales.vencido, totales.porVencer],
          backgroundColor: ['rgba(181, 101, 76, 0.75)', 'rgba(122, 143, 126, 0.6)'],
          borderColor: ['#8c4a38', '#556b5f'],
          borderWidth: 1,
        },
      ],
    }
  }, [totales.vencido, totales.porVencer])

  return (
    <div className="admin-panel">
      <h2>Cuenta por pagar</h2>
      <p className="lead">
        Se calcula la fecha de pago por compra: <strong>fecha de compra + días de crédito</strong>. Los
        montos se agrupan por <strong>mes de vencimiento</strong> (qué mes toca liquidar). La
        distinción vencida / por vencer se basa en la fecha de hoy.
      </p>

      {error ? <Message severity="error" text={error} className="admin-pr-message w-full mb-3" /> : null}
      {loading ? <p className="lead">Cargando…</p> : null}

      {!loading && !error ? (
        <>
          <div className="admin-kpi-grid">
            <Card className="admin-p-card" title="Total cuenta por pagar" subTitle="(todas las compras)">
              <span className="admin-kpi-num-prime">{formatMoneyGtq(totales.total)}</span>
            </Card>
            <Card className="admin-p-card" title="Monto vencido" subTitle="Vencimiento anterior a hoy">
              <span className="admin-kpi-num-prime" style={{ color: '#8c4a38' }}>
                {formatMoneyGtq(totales.vencido)}
              </span>
            </Card>
            <Card className="admin-p-card" title="Por vencer" subTitle="Vencimiento a partir de hoy">
              <span className="admin-kpi-num-prime" style={{ color: '#556b5f' }}>
                {formatMoneyGtq(totales.porVencer)}
              </span>
            </Card>
          </div>

          <div className="admin-charts-grid" style={{ marginTop: '1.25rem' }}>
            <Card className="admin-p-card" title="Monto por pagar según mes de vencimiento (12 meses)">
              <div className="admin-chart-host">
                <Chart type="bar" data={chartMontoPorMesVenc} options={adminCurrencyBarOptions} />
              </div>
            </Card>
            <Card className="admin-p-card" title="Vencido vs por vencer (últimos 6 meses, por mes de venc.)">
              <div className="admin-chart-host">
                <Chart type="bar" data={chartVencidoStack} options={adminStackedCurrencyBarOptions} />
              </div>
            </Card>
          </div>

          <Card className="admin-p-card" style={{ marginTop: '1.25rem' }} title="Proporción (vencido vs por vencer)">
            <div className="admin-chart-host" style={{ height: 240 }}>
              <Chart type="doughnut" data={estadosData} options={adminDoughnutOptions} />
            </div>
          </Card>

          <h3 className="admin-report-subtitle">Detalle por compra</h3>
          <div className="admin-catalog-card" style={{ marginTop: '0.75rem' }}>
            <DataTable value={rows} dataKey="id" paginator rows={10} size="small" emptyMessage="Sin compras.">
              <Column field="proveedor" header="Proveedor" sortable />
              <Column header="Fecha compra" body={(r) => formatDate(r.fecha_compra)} sortable />
              <Column field="dias_credito" header="Días crédito" style={{ width: '7rem' }} />
              <Column header="Vencimiento" body={(r) => formatDate(r.vencimiento)} sortable />
              <Column
                header="Monto"
                body={(r) => formatMoneyGtq(r.total)}
                style={{ width: '8rem' }}
              />
              <Column
                header="Estado"
                body={(r) => (
                  <Tag severity={r.estado === 'vencido' ? 'danger' : 'success'}>
                    {r.estado === 'vencido' ? 'Vencido' : 'Por vencer'}
                  </Tag>
                )}
                style={{ width: '8rem' }}
              />
            </DataTable>
          </div>
        </>
      ) : null}
    </div>
  )
}
