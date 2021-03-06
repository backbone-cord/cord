;(function(Backbone) {
'use strict';

var Cord = Backbone.Cord;
var Model = Cord.Model;
var EmptyModel = Cord.EmptyModel;
var ForceValue = Cord.ForceValue;

var _formats = {
	url: /^(https?:\/\/(?:www\.|(?!www))[^\s\.]+\.[^\s]{2,}|www\.[^\s]+\.[^\s]{2,})/i,
	ip: /^(?:(?:25[0-5]|2[0-4][0-9]|[01]?[0-9][0-9]?)\.){3}(?:25[0-5]|2[0-4][0-9]|[01]?[0-9][0-9]?)$/i,
	email: /^[a-z0-9!#$%&'*+\/=?^_`{|}~.-]+@[a-z0-9]([a-z0-9-]*[a-z0-9])?(\.[a-z0-9]([a-z0-9-]*[a-z0-9])?)*$/i,
	slug: /^[a-z0-9-]+$/i,
	username: /^[a-z0-9_@\-\+\.]{3,150}$/i,
	color: /^#?([a-f0-9]{6}|[a-f0-9]{3})$/i
};

Cord.Validation = {
	formats: _formats
};

Cord.scopes.errors = {
	namespace: 'errors',
	observe: function() {},
	unobserve: function() {},
	getValue: function(key) { return this.errors.get(key); },
	setValue: function() {}
};

Cord.validate = function(value, rule) {
	var i, format, formats, type = rule.type.split(' ')[0];
	if(value === null || (value === '' && rule.type === 'string'))
		return rule.required ? 'required' : true;
	if((type === 'string' && typeof(value) !== 'string') ||
		(type === 'date' && !(value instanceof Date)) ||
		(type === 'int' && !(+value === value && (value % 1) === 0)) ||
		(type === 'float' && typeof(value) !== 'number') ||
		(type === 'bool' && typeof(value) !== 'boolean') ||
		(type === 'array' && !Array.isArray(value)) ||
		(type === 'model' && !(value instanceof Model))
	)
			return 'type';
	if(rule.equals !== null && rule.equals !== void(0)) {
		if(Array.isArray(rule.equals)) {
			if(rule.equals.indexOf(value) === -1)
				return 'equals';
		}
		else if(typeof(rule.equals) === 'object') {
			if(rule.equals[value] === void(0))
				return 'equals';
		}
		else if(value !== rule.equals) {
			return 'equals';
		}
	}
	else {
		if(rule.type === 'string') {
			if(rule.min && value.length < rule.min)
				return 'min';
			if(rule.max && value.length > rule.max)
				return 'max';
			if(rule.format) {
				formats = Array.isArray(rule.format) ? rule.format : [rule.format];
				for(i = 0; i < formats.length; ++i) {
					format = formats[i];
					if(typeof(format) === 'string')
						format = _formats[format];
					if((typeof(format) === 'function' && !format(value)) ||
						(format instanceof RegExp && !format.test(value))
					)
						return 'format';
				}
			}
		}
		else {
			if(rule.min && value < rule.min)
				return 'min';
			if(rule.max && value > rule.max)
				return 'max';
		}
	}
	return true;
};

Cord.parseValidationError = function(value, rule, error, title) {
	// Override to provide custom error messages based on error strings
	var len = rule.type === 'string' ? 'The length of ' : '';
	var chars = rule.type === 'string' ? ' characters' : '';
	switch(error) {
		case 'required':
			return title + ' is required';
		case 'min':
			return len + title + ' must be greater than or equal to ' + rule.min + chars;
		case 'max':
			return len + title + ' must be less than or equal to ' + rule.max + chars;
		case 'format':
			if(typeof rule.format === 'string')
				return title + ' is not a valid ' + rule.format;
			break;
		default:
			break;
	}
	return title + ' is not valid';
};

Cord.mixins.validation = {
	errors: EmptyModel,
	properties: {
		allErrors: { readonly: true },
		latestError: { readonly: true },
		isValid: function(allErrors) {
			if(allErrors === '__args__')
				return ['allErrors'];
			return !allErrors || !allErrors.length;
		}
	},
	events: {
		'submit form': 'onSubmitValidate'
	},
	initialize: function() {
		this.errors = new Model();
		this.listenTo(this.errors, 'change', function(model) {
			var key, changed = model.changedAttributes();
			if(!changed)
				return;
			for(key in changed)
				this._invokeObservers('errors', key, changed[key]);
		});
		this._addValidatonListeners(this.model);
	},
	setModel: function(newModel) {
		this._addValidatonListeners(newModel);
	},
	onSubmitValidate: function(e) {
		if(this.model.isValid()) {
			return true;
		}
		else {
			if(e) {
				e.preventDefault();
				e.stopPropagation();
			}
			return false;
		}
	},
	_addValidatonListeners: function(model) {
		if(model !== EmptyModel) {
			this.listenTo(model, 'invalid', this._onInvalid);
			this.listenTo(model, 'valid', this._onValid);
		}
	},
	_onInvalid: function(model, validationErrors) {
		var attr, errors, allErrors, latestError, changed;

		for(attr in validationErrors) {
			// Convert all validationErrors to error messages
			if(validationErrors[attr] === 'format' && this.model.instructions && this.model.instructions[attr])
				latestError = this.model.instructions[attr];
			else
				latestError = Cord.parseValidationError(this.model.get(attr), this.model.rules[attr], validationErrors[attr], this.model.titles[attr] || 'This field', attr);
			this.errors.set(attr, latestError);
		}
		changed = this.model.changedAttributes();
		for(attr in changed) {
			// Anything in the changedAttributes but not in the validationErrors should be cleared
			if(!validationErrors[attr])
				this.errors.unset(attr);
		}
		allErrors = [];
		errors = this.errors.attributes;
		for(attr in errors)
			allErrors.push(errors[attr]);
		this.setValueForKey('allErrors', new ForceValue(allErrors));
		this.setValueForKey('latestError', new ForceValue(latestError));

	},
	_onValid: function(model) {
		// Use code within _onInvalid to clear previous error messages
		this._onInvalid(model, {});
	}
};

Cord.mixins.validateOnBlur = {
	initialize: function() {
		this._addBlurListener(this.model);
	},
	setModel: function(newModel) {
		this._addBlurListener(newModel);
	},
	_addBlurListener: function(model) {
		if(model !== EmptyModel) {
			model.listen('change', function(model) {
				var errors = model.validate(model.changedAttributes(), { partial: true });
				// TODO: update based on only new errors
			});
		}
	}
};

Model.prototype.validate = function(attributes, options) {
	var attr, rule, ret, errors = {};
	if(!this.rules)
		return null;
	for(attr in attributes) {
		rule = this.rules[attr];
		if(rule) {
			if(rule.equals === null && rule.equals === void(0))
				rule.equals = this.choices && this.choices[attr];
			ret = Cord.validate(attributes[attr], rule);
			if(ret !== true)
				errors[attr] = ret;
		}
	}
	// Custom validation can also add to the errors object
	if(this.extendedValidate)
		this.extendedValidate(errors);
	if(Object.keys(errors).length)
		return errors;
	else if(!options.partial)
		this.trigger('valid', this, options);
};

})(((typeof self === 'object' && self.self === self && self) || (typeof global === 'object' && global.global === global && global)).Backbone || require('backbone'));
