import {
  BarController,
  BarElement,
  CategoryScale,
  Chart,
  Filler,
  Legend,
  LinearScale,
  LineController,
  LineElement,
  PointElement,
  Tooltip,
} from 'chart.js'

Chart.register(BarController, BarElement, LineController, LineElement, PointElement, Filler, CategoryScale, LinearScale, Legend, Tooltip)

Chart.defaults.font.family = "'JetBrains Mono Variable', ui-monospace, monospace"
Chart.defaults.font.size = 11
Chart.defaults.animation = false
