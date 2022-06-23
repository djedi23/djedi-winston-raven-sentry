const _ = require('lodash');
const Raven = require('raven');
const winston = require('winston');
const Transport = require('winston-transport');
const util = require('util');

function errorHandler(err) {
    console.error(err.message);
}

class Sentry extends Transport {
    constructor (options) {

	options = options || {};
	options = _.defaultsDeep(options, {
	    dsn: process.env.SENTRY_DSN || '',
	    config: {
		logger: 'winston-raven-sentry',
		captureUnhandledRejections: false
	    },
	    errorHandler,
	    install: false,
	    name: 'sentry',
	    silent: false,
	    level: 'info',
	    levelsMap: {
		silly: 'debug',
		verbose: 'debug',
		info: 'info',
		debug: 'debug',
		warn: 'warning',
		error: 'error'
	    }
	});
	super(options);
	// Transport.call(this, _.omit(options, [
	//     'levelsMap',
	//     'install',
	//     'dsn',
	//     'config',
	//     'tags',
	//     'globalTags',
	//     'extra',
	//     'errorHandler',
	//     'raven'
	// ]));
	this._levelsMap = options.levelsMap;

	if (options.tags)
	    options.config.tags = options.tags;
	else if (options.globalTags)
	    options.config.tags = options.globalTags;

	if (options.extra) {
	    options.config.extra = options.config.extra || {};
	    options.config.extra = _.defaults(
		options.config.extra,
		options.extra
	    );
	}

	// expose the instance on the transport
	this.raven = options.raven || Raven.config(options.dsn, options.config);

	if (_.isFunction(options.errorHandler) && this.raven.listeners('error').length === 0)
	    this.raven.on('error', options.errorHandler);

	// it automatically will detect if it's already installed
	if (options.install || options.patchGlobal)
	    this.raven.install();


    };

    // Inherit from `winston.Transport`
    //util.inherits(Sentry, Transport);

    // Define a getter so that `winston.transports.Sentry`
    // is available and thus backwards compatible
    //winston.transports.Sentry = Sentry;

    log (info, fn) {
	// level, msg, meta
	if (this.silent) return fn(null, true);
	if (!(info.level in this._levelsMap)) return fn(null, true);
	setImmediate(() => {
	    this.emit('logged', info);
	});
	
	const message = this._normalizeMessage(info.message, info.meta);
	const context = _.isObject(info.meta) ? info.meta : {};
	context.level = this._levelsMap[info.level];
	context.extra = this._normalizeExtra(info.message, info.meta);

	if (this._shouldCaptureException(context.level))
	    return this.raven.captureException(message, context, function() {
		fn(null, true);
	    });

	this.raven.captureMessage(message, context, function() {
	    fn(null, true);
	});

    }

    _shouldCaptureException (level) {
	return level === 'error' || level === 'fatal';
    }

    _normalizeExtra (msg, meta) {

	const extra = _.isObject(meta) ? (meta.extra || {}) : {};

	if (_.isError(msg) && !_.isObject(extra.err)) {
	    extra.err = { stack: msg.stack, message: msg.message };
	}

	if (_.isError(meta) && !_.isObject(extra.err)) {
	    extra.err = { stack: meta.stack, message: meta.message };
	}

	return extra;
    }

    _normalizeMessage (msg, meta) {
	let message = msg;

	if (_.isError(msg)) {
	    message = msg.message;
	}

	if (_.isError(meta) && !_.isString(message)) {
	    message = meta.message;
	}

	return message;
    }
}


module.exports = Sentry;
