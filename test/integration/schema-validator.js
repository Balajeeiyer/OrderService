const axios = require('axios');
const xml2js = require('xml2js');

/**
 * Schema Validator
 * Validates MockAI OData $metadata for breaking changes
 */
class SchemaValidator {
  constructor(baseURL) {
    this.baseURL = baseURL;
    this.parser = new xml2js.Parser({ explicitArray: false });
  }

  /**
   * Fetch and parse $metadata from MockAI service
   * @returns {Promise<Object>} Parsed metadata
   */
  async fetchMetadata() {
    try {
      const response = await axios.get(`${this.baseURL}/$metadata`, {
        timeout: 10000,
        headers: { 'Accept': 'application/xml' }
      });

      const parsed = await this.parser.parseStringPromise(response.data);
      return parsed;
    } catch (error) {
      throw new Error(`Failed to fetch metadata: ${error.message}`);
    }
  }

  /**
   * Extract entity type definition from metadata
   * @param {Object} metadata - Parsed metadata
   * @param {string} entityName - Name of entity (e.g., 'Products')
   * @returns {Object|null} Entity type definition
   */
  extractEntityType(metadata, entityName) {
    try {
      const schema = metadata['edmx:Edmx']['edmx:DataServices']['Schema'];
      const entityTypes = Array.isArray(schema.EntityType) ? schema.EntityType : [schema.EntityType];

      return entityTypes.find(et => et.$.Name === entityName) || null;
    } catch (error) {
      throw new Error(`Failed to extract entity type ${entityName}: ${error.message}`);
    }
  }

  /**
   * Validate entity structure against baseline
   * @param {Object} current - Current entity type
   * @param {Object} baseline - Baseline entity type
   * @returns {Object} Validation result
   */
  validateEntityStructure(current, baseline) {
    const result = {
      valid: true,
      errors: [],
      warnings: [],
      changes: {
        removedProperties: [],
        addedProperties: [],
        modifiedProperties: [],
        removedKeys: [],
        addedKeys: []
      }
    };

    if (!current) {
      result.valid = false;
      result.errors.push('Current entity type not found');
      return result;
    }

    if (!baseline) {
      result.warnings.push('No baseline to compare against');
      return result;
    }

    // Normalize properties to arrays
    const currentProps = Array.isArray(current.Property) ? current.Property : [current.Property];
    const baselineProps = Array.isArray(baseline.Property) ? baseline.Property : [baseline.Property];

    // Check for removed properties (BREAKING)
    for (const baseProp of baselineProps) {
      const exists = currentProps.find(p => p.$.Name === baseProp.$.Name);
      if (!exists) {
        result.valid = false;
        result.errors.push(`Property '${baseProp.$.Name}' removed (BREAKING CHANGE)`);
        result.changes.removedProperties.push(baseProp.$.Name);
      }
    }

    // Check for added properties (NON-BREAKING)
    for (const currProp of currentProps) {
      const exists = baselineProps.find(p => p.$.Name === currProp.$.Name);
      if (!exists) {
        result.warnings.push(`Property '${currProp.$.Name}' added`);
        result.changes.addedProperties.push(currProp.$.Name);
      }
    }

    // Check for modified property types (BREAKING)
    for (const currProp of currentProps) {
      const baseProp = baselineProps.find(p => p.$.Name === currProp.$.Name);
      if (baseProp && baseProp.$.Type !== currProp.$.Type) {
        result.valid = false;
        result.errors.push(
          `Property '${currProp.$.Name}' type changed from ${baseProp.$.Type} to ${currProp.$.Type} (BREAKING CHANGE)`
        );
        result.changes.modifiedProperties.push({
          name: currProp.$.Name,
          oldType: baseProp.$.Type,
          newType: currProp.$.Type
        });
      }

      // Check nullable changes
      if (baseProp) {
        const baseNullable = baseProp.$.Nullable === undefined || baseProp.$.Nullable === 'true';
        const currNullable = currProp.$.Nullable === undefined || currProp.$.Nullable === 'true';

        if (baseNullable && !currNullable) {
          result.valid = false;
          result.errors.push(
            `Property '${currProp.$.Name}' changed from nullable to non-nullable (BREAKING CHANGE)`
          );
        }
      }
    }

    // Check keys
    if (current.Key && baseline.Key) {
      const currentKeys = Array.isArray(current.Key.PropertyRef)
        ? current.Key.PropertyRef.map(k => k.$.Name)
        : [current.Key.PropertyRef.$.Name];

      const baselineKeys = Array.isArray(baseline.Key.PropertyRef)
        ? baseline.Key.PropertyRef.map(k => k.$.Name)
        : [baseline.Key.PropertyRef.$.Name];

      // Check for removed keys (BREAKING)
      for (const baseKey of baselineKeys) {
        if (!currentKeys.includes(baseKey)) {
          result.valid = false;
          result.errors.push(`Key property '${baseKey}' removed (BREAKING CHANGE)`);
          result.changes.removedKeys.push(baseKey);
        }
      }

      // Check for added keys
      for (const currKey of currentKeys) {
        if (!baselineKeys.includes(currKey)) {
          result.warnings.push(`Key property '${currKey}' added`);
          result.changes.addedKeys.push(currKey);
        }
      }
    }

    return result;
  }

  /**
   * Validate entity set (navigation properties, actions, functions)
   * @param {Object} metadata - Parsed metadata
   * @param {string} entitySetName - Name of entity set (e.g., 'Products')
   * @returns {Object} Validation result
   */
  validateEntitySet(metadata, entitySetName) {
    const result = {
      valid: true,
      errors: [],
      warnings: [],
      entitySet: null
    };

    try {
      const schema = metadata['edmx:Edmx']['edmx:DataServices']['Schema'];
      const container = schema.EntityContainer;
      const entitySets = Array.isArray(container.EntitySet) ? container.EntitySet : [container.EntitySet];

      result.entitySet = entitySets.find(es => es.$.Name === entitySetName);

      if (!result.entitySet) {
        result.valid = false;
        result.errors.push(`EntitySet '${entitySetName}' not found`);
      }
    } catch (error) {
      result.valid = false;
      result.errors.push(`Failed to validate entity set: ${error.message}`);
    }

    return result;
  }

  /**
   * Comprehensive validation against baseline
   * @param {Object} baseline - Baseline metadata
   * @returns {Promise<Object>} Validation result
   */
  async validateAgainstBaseline(baseline) {
    const current = await this.fetchMetadata();

    const result = {
      valid: true,
      timestamp: new Date().toISOString(),
      summary: {
        totalErrors: 0,
        totalWarnings: 0,
        entitiesValidated: 0
      },
      entities: {}
    };

    // Validate Products entity
    const currentProducts = this.extractEntityType(current, 'Products');
    const baselineProducts = this.extractEntityType(baseline, 'Products');

    const productsValidation = this.validateEntityStructure(currentProducts, baselineProducts);
    result.entities.Products = productsValidation;

    if (!productsValidation.valid) {
      result.valid = false;
    }

    result.summary.totalErrors += productsValidation.errors.length;
    result.summary.totalWarnings += productsValidation.warnings.length;
    result.summary.entitiesValidated = 1;

    return result;
  }

  /**
   * Save metadata as baseline
   * @param {string} filePath - Path to save baseline
   * @returns {Promise<void>}
   */
  async saveBaseline(filePath) {
    const fs = require('fs').promises;
    const metadata = await this.fetchMetadata();
    await fs.writeFile(filePath, JSON.stringify(metadata, null, 2));
  }

  /**
   * Load baseline from file
   * @param {string} filePath - Path to baseline file
   * @returns {Promise<Object>} Baseline metadata
   */
  async loadBaseline(filePath) {
    const fs = require('fs').promises;
    const data = await fs.readFile(filePath, 'utf8');
    return JSON.parse(data);
  }
}

module.exports = SchemaValidator;
