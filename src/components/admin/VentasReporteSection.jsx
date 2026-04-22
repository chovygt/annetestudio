import { useCallback, useEffect, useMemo, useState } from 'react'
import { Card } from 'primereact/card'
import { Chart } from 'primereact/chart'
import { Message } from 'primereact/message'
import { adminCurrencyBarOptions, adminDoughnutOptions, barMoneyDatasetFromBuckets } from '../../lib/adminChartTheme.js'
import { lastNMonthMoneyBuckets, sumMoneyIntoMonthBuckets } from '../../lib/adminMoneyBuckets.js'
import { supabase } from '../../lib/supabaseClient.js'

function parseLineTotal(row) {
  return Number(row.cantidad || 0) * Number(row.precio_unitario || 0)
}

export default function VentasReporteSection() {
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState(null)
  const [ventas, setVentas] = useState([])

  const load = useCallback(async () => {
    setLoading(true)
    setError(null)
    const { data, error: qErr } = await supabase
      .from('ventas')
      .select(
        `
        id,
        fecha_venta,
        ventas_detalle (
          cantidad,
          precio_unitario,
          servicios ( codigo, descripcion )
        )
      `
      )
    setLoading(false)
    if (qErr) {
      setError(qErr.message)
      return
    }
    setVentas(data || [])
  }, [])

  useEffect(() => {
    load()
  }, [load])

  const lineRows = useMemo(() => {
    const out = []
    for (const v of ventas) {
      const fv = v.fecha_venta
      for (const d of v.ventas_detalle || []) {
        const label = d.servicios?.codigo
          ? `${d.servicios.codigo} — ${(d.servicios.descripcion || '').slice(0, 32)}`
          : 'Servicio'
        out.push({
          ventaId: v.id,
          fecha_venta: fv,
          servicioKey: d.servicios?.codigo || d.servicios?.descripcion || '—',
          servicioLabel: label,
          monto: parseLineTotal(d),
        })
      }
    }
    return out
  }, [ventas])

  const totalGeneral = useMemo(() => lineRows.reduce((a, r) => a + r.monto, 0), [lineRows])

  const bucketsMes = useMemo(() => {
    const b = lastNMonthMoneyBuckets(12)
    sumMoneyIntoMonthBuckets(
      b,
      lineRows,
      (r) => r.fecha_venta,
      (r) => r.monto
    )
    return b
  }, [lineRows])

  const chartVentasMes = useMemo(
    () =>
      barMoneyDatasetFromBuckets(
        bucketsMes,
        'Ventas ($)',
        'rgba(181, 101, 76, 0.78)',
        '#8c4a38'
      ),
    [bucketsMes]
  )

  const porServicio = useMemo(() => {
    const map = new Map()
    for (const r of lineRows) {
      const k = r.servicioKey
      map.set(k, (map.get(k) || 0) + r.monto)
    }
    const arr = [...map.entries()].sort((a, b) => b[1] - a[1])
    const top = arr.slice(0, 8)
    const otros = arr.slice(8).reduce((a, [, v]) => a + v, 0)
    if (otros > 0) top.push(['Otros', otros])
    return top
  }, [lineRows])

  const chartServicios = useMemo(() => {
    const colors = [
      'rgba(181, 101, 76, 0.85)',
      'rgba(122, 143, 126, 0.8)',
      'rgba(200, 170, 130, 0.85)',
      'rgba(100, 120, 140, 0.75)',
      'rgba(160, 130, 110, 0.8)',
      'rgba(140, 160, 130, 0.75)',
      'rgba(190, 150, 120, 0.8)',
      'rgba(150, 150, 130, 0.75)',
      'rgba(90, 90, 90, 0.35)',
    ]
    return {
      labels: porServicio.map(([k]) => k),
      datasets: [
        {
          data: porServicio.map(([, v]) => v),
          backgroundColor: porServicio.map((_, i) => colors[i % colors.length]),
          borderColor: porServicio.map((_, i) => colors[Math.min(i, colors.length - 1)]),
          borderWidth: 1,
        },
      ],
    }
  }, [porServicio])

  const lineChartData = useMemo(() => {
    return {
      labels: bucketsMes.map((b) => b.label),
      datasets: [
        {
          label: 'Ventas totales',
          data: bucketsMes.map((b) => b.amount),
          borderColor: '#8c4a38',
          backgroundColor: 'rgba(181, 101, 76, 0.15)',
          fill: true,
          tension: 0.25,
        },
      ],
    }
  }, [bucketsMes])

  const lineOptions = useMemo(
    () => ({
      ...adminCurrencyBarOptions,
      plugins: { legend: { display: true } },
    }),
    []
  )

  return (
    <div className="admin-panel">
      <h2>Reporte de ventas</h2>
      <p className="lead">
        Ventas totales por <strong>mes de la venta</strong> (últimos 12 meses) y desglose por{' '}
        <strong>servicio</strong> (código) en el período.
      </p>

      {error ? <Message severity="error" text={error} className="admin-pr-message w-full mb-3" /> : null}
      {loading ? <p className="lead">Cargando…</p> : null}

      {!loading && !error ? (
        <>
          <div className="admin-kpi-grid">
            <Card className="admin-p-card" title="Total ventas (período cargado)">
              <span className="admin-kpi-num-prime">${totalGeneral.toFixed(2)}</span>
            </Card>
          </div>

          <div className="admin-charts-grid" style={{ marginTop: '1.25rem' }}>
            <Card className="admin-p-card" title="Ventas totales por mes (barras)">
              <div className="admin-chart-host">
                <Chart type="bar" data={chartVentasMes} options={adminCurrencyBarOptions} />
              </div>
            </Card>
            <Card className="admin-p-card" title="Tendencia de ventas (línea)">
              <div className="admin-chart-host">
                <Chart type="line" data={lineChartData} options={lineOptions} />
              </div>
            </Card>
          </div>

          <Card className="admin-p-card" style={{ marginTop: '1.25rem' }} title="Ventas por servicio (código) — top">
            <div className="admin-chart-host" style={{ height: 300 }}>
              <Chart type="doughnut" data={chartServicios} options={adminDoughnutOptions} />
            </div>
          </Card>
        </>
      ) : null}
    </div>
  )
}
