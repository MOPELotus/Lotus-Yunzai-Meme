import chalk from 'chalk'

import { Config, Version } from '#components'

(async () => {
  let dailyNoteByWidget
  try {
    dailyNoteByWidget = (await import('../../earth-k-plugin/apps/emoticon.js')).dailyNoteByWidget
  } catch (error) {
    logger.warn(chalk.cyan(`${Version.Plugin_LogName} 外部表情入口未加载，跳过接管`))
    return
  }

  if (Config.other.hijackRes) {
    try {
      dailyNoteByWidget.prototype.accept = async function () {
        logger.debug(chalk.yellow(`${Version.Plugin_LogName} 已接管外部表情入口`))
      }
    } catch (error) {
      logger.error(`${Version.Plugin_LogName} 接管外部表情入口失败`)
    }
  }
})()
