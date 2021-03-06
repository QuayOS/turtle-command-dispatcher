/**
 * QuayOS Turtle Command Dispatcher Server MQTT Client.
 * @module
 */

'use strict'

const log = require('logbook').createLogger(__filename)

const { MQTTWrapper } = require('bowline')

/**
 * MQTT client managing communication with turtles and updating turtle state.
 */
class Client {
  /**
   * Create a new client.
   * @param {module:models/turtle-manager~TurtleManager} turtleManager The
   * TurtleManager instance for storing turtle state
   * @param {object} [options] Options for configuring the client.
   * @param {string} options.server=mqtt://test.mosquitto.org The MQTT server to connect to.
   * @param {string} options.baseTopic=quayos/turtles The base topic to use for communicating
   * with turtles.
   */
  constructor (turtleManager, options) {
    this.client = new MQTTWrapper()

    this.server = (options && options.server) || 'mqtt://test.mosquitto.org'
    this.baseTopic = (options && options.baseTopic) || 'quayos/turtles'

    this.turtles = turtleManager
  }

  /**
   * Connect to the MQTT server and start listening for status updates.
   * @return {Promise} Resolves when the client disconnects.
   */
  async run () {
    log.info('Connecting to MQTT server')
    await this.client.connect(this.server)

    log.info('Registering topic handlers')
    await this.client.subscribe(`${this.baseTopic}/+/status`, this.statusHandler.bind(this))

    await this.client.onOffline
    log.info('Shut down MQTT client')
  }

  /**
   * Stop the MQTT client.
   * @return {Promise} Resolves when the client goes offline.
   */
  async stop () {
    log.info('Stopping client')
    await Promise.all([
      this.client.disconnect(),
      this.client.onOffline
    ])
    log.info('Client stopped')
  }

  /**
   * Called when a status update is received on a status topic.
   * @private
   * @param  {module:models/turtle~TurtleStatus} message The turtle status update to handle.
   * @param  {string} topic The topic the update was received on.
   * @return {Promise} Resolves when the corresponding turtle's status was updated.
   */
  async statusHandler (message, topic) {
    const turtleIdMatch = topic.match(/([^/]+)\/status$/)
    if (!turtleIdMatch) {
      log.error('Could extract turtleId from topic', { topic })
      return
    }
    const turtleId = turtleIdMatch[1]

    log.verbose('Received status update', { turtleId, status: message, topic })

    try {
      if (message === null) {
        this.turtles.deleteTurtle(turtleId)
      } else {
        if (message.online) {
          message.inventory = message.inventory.map(slot => Array.isArray(slot) ? null : slot)
        }
        await (this.turtles.getTurtle(turtleId).updateStatus(message))
      }
    } catch (err) {
      log.warn('Failed to update turtle status', { err: err.stack })
    }
  }
}

module.exports = {
  Client
}
