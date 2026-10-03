const handlebars = require('handlebars');

/**
 * Handlebars Template Rendering Engine
 */
class TemplateEngine {
  constructor() {
    this.cache = new Map();
  }

  /**
   * Compile and render raw HTML template string with data context
   * @param {string} templateSource
   * @param {object} context
   * @returns {string} rendered HTML
   */
  renderString(templateSource, context) {
    const template = handlebars.compile(templateSource);
    return template(context);
  }

  /**
   * Pre-compile and cache template
   */
  registerTemplate(name, templateSource) {
    const compiled = handlebars.compile(templateSource);
    this.cache.set(name, compiled);
  }

  render(name, context) {
    const compiled = this.cache.get(name);
    if (!compiled) {
      throw new Error(`Template '${name}' not found.`);
    }
    return compiled(context);
  }
}

module.exports = new TemplateEngine();
