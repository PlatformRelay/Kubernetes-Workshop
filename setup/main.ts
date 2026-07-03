import { defineAppSetup } from '@slidev/types'
import { MotionPlugin } from '@vueuse/motion'

export default defineAppSetup(({ app }) => {
  app.use(MotionPlugin)
})
