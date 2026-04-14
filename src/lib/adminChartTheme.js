/** Opciones Chart.js (PrimeReact `Chart`) alineadas con look tierra / Anneth. */
export const adminBarChartOptions = {
  maintainAspectRatio: false,
  responsive: true,
  plugins: {
    legend: {
      position: 'top',
      labels: {
        color: '#3d362e',
        font: { family: 'Outfit, system-ui, sans-serif', size: 12 },
      },
    },
  },
  scales: {
    x: {
      ticks: {
        color: '#5c534a',
        maxRotation: 55,
        minRotation: 0,
        font: { size: 10 },
      },
      grid: { color: 'rgba(44, 36, 28, 0.08)' },
    },
    y: {
      beginAtZero: true,
      ticks: {
        stepSize: 1,
        color: '#5c534a',
        precision: 0,
      },
      grid: { color: 'rgba(44, 36, 28, 0.08)' },
    },
  },
}

export function barDatasetFromBuckets(buckets, label, backgroundColor, borderColor) {
  return {
    labels: buckets.map((b) => b.label),
    datasets: [
      {
        label,
        data: buckets.map((b) => b.count),
        backgroundColor,
        borderColor,
        borderWidth: 1,
        borderRadius: 6,
      },
    ],
  }
}
