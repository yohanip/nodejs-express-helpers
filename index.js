'use strict'

let helper = {},
  _ = require('lodash')

helper.errorResponse = (res, e) => {
  if (_.isString(e)) {
    return res.status(422).send({error: e})
  } else {
    if (e.errors && Array.isArray(e.errors) && e.errors[0].message) {
      return res.status(422).send({error: e.errors[0].message})
    }
    else if(e.error) {
      return res.status(422).send(e)
    }
    else {
      global.logger.error(e)
      return res.status(422).send({error: 'Server error.'})
    }
  }
}

let methods = ['log', 'trace', 'debug', 'info', 'warn', 'error'],
  masterLogger = {
    cns: require('tracer').console(),
    fns: require('tracer').dailyfile({root: './app-logs', maxLogFiles: 100, splitFormat: 'yyyy-mm-dd'}),
  }

methods.forEach((m)=> {
  masterLogger[m] = function () {
    this.method = m
    let args = Array.prototype.slice.call(arguments)
    masterLogger.cns[m].apply(null, args)

    // only errors/debugs will be loged to file..
    if (this.method == 'error' || this.method == 'debug') {
      let err = new Error()
      masterLogger.fns[m].apply(null, args)
      masterLogger.fns[m].apply(null, [err.stack])
    }
  }
})

// if the programmer wanted to directly use the console loger or file loger..
masterLogger.toConsole = masterLogger.cns
masterLogger.toFile = masterLogger.fns

helper.masterLogger = masterLogger

helper.queryBuilder = function (debug) {
  this.debug = debug
  this.selects = []
  this.froms = []
  this.wheres = []
  this.orders = []
  this.limit = false
  this.offset = false

  this.select = (q) => {
    this.selects.push(q)
    return this
  }

  this.from = (q) => {
    this.froms.push(q)
    return this
  }

  this.where = (q) => {
    this.wheres.push(q)
    return this
  }

  this.order = (q) => {
    this.orders.push(q)
    return this
  }

  this.paged = (page, itemsPerPage) => {
    if (page < 0) page = 1
    if (itemsPerPage) {
      this.limit = itemsPerPage
      this.offset = (page - 1) * itemsPerPage
    }
    return this
  }

  this.render = () => {
    let sql = []
    if (this.selects.length == 0) this.selects.push('*')

    sql.push('SELECT ' + this.selects.join(', '))
    sql.push('FROM ' + this.froms.join(',\n '))

    if (this.wheres.length > 0) {
      let wheres__ = this.wheres.map(a=>`(${a})`)
      sql.push('WHERE ' + wheres__.join(' AND '))
    }

    if (this.orders.length > 0) sql.push('ORDER BY ' + this.orders.join(', '))

    if (this.limit) {
      sql.push(`LIMIT ${this.limit}`)

      if (this.offset) sql.push(`OFFSET ${this.offset}`)
    }

    let statement = sql.join('\n')

    if (this.debug) console.log('Executing:', statement)

    return statement
  }
}

/**
 * validate a model by using laravel's system
 * @param model
 * @param rules object of rules.. example: {
 *   fieldName: 'notEmpty|min:1|numeric|len:3,6'
 * }
 * @param messages object of messages : {
 *   'fieldName:required' : 'field is required..'
 * }
 */
helper.validate = function (model, rules, messages) {
  let validate = require('data-validate')

  _.forEach(rules, (rule, field) => {
    let rulez = rule.split('|')

    // 'notEmpty|min:1|isNumeric|len:3,6'
    rulez.forEach((arule) => {
      let trueRule = validate

      // does it have parameter?
      arule = arule.split(':')

      if (!trueRule.hasOwnProperty(arule[0])) throw `unknown method: ${arule[0]}`

      if (arule.length > 1) {
        // len:3,6
        // with a parameter..
        let args = arule[1].split(',')
        trueRule = trueRule[arule[0]].apply(trueRule, args)
      } else {
        // no parameter
        // isNumeric
        trueRule = trueRule[arule[0]]()
      }

      if(!arule[1]) arule[1] = ''

      if (!trueRule(model[field])) {
        throw `Field "${field}" did not satisfy rule: "${arule.join(' ')}"`
      }
    })
  })

  return true
}

helper.btcAddress = () => {
  return require ('bitcoinjs-lib').ECPair.makeRandom().getAddress()
}

module.exports = helper