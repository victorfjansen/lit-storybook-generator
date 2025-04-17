import * as fs from 'fs';
import * as path from 'path';
import { glob } from 'glob';
import { parse } from '@babel/parser';
import traverse from '@babel/traverse';
import * as t from '@babel/types';
import { UserConfig } from 'vite';

/**
 * Interface for generator options
 */
interface LitStorybookGeneratorOptions {
  /**
   * Glob pattern to find LIT files
   * Example: "/src/*.ce.ts"
   */
  pattern: string;
}

/**
 * Interface for extracted LIT properties
 */
interface LitProperty {
  type: string;
  default?: string | number | boolean | null;
}

/**
 * Creates a plugin to generate Storybook stories from LIT components
 * @param options Configuration options
 * @returns Function to use in viteFinal
 */
export function litStorybookGenerator(options: LitStorybookGeneratorOptions): (config: UserConfig) => Promise<UserConfig> {
  const { pattern } = options;

  return async function (config: UserConfig): Promise<UserConfig> {
    console.log(`\n🔍 Searching for LIT components with pattern: ${pattern}`);

    // Find all files matching the pattern
    const files = glob.sync(pattern);

    if (files.length === 0) {
      console.warn(`⚠️ No files found matching pattern "${pattern}"`);
    } else {
      console.log(`📋 Found ${files.length} files to process...`);

      let successCount = 0;
      let errorCount = 0;

      for (const file of files) {
        try {
          const fileContent = fs.readFileSync(file, 'utf-8');
          const fileDir = path.dirname(file);
          const fileName = path.basename(file, path.extname(file));
          const componentName = fileName.replace('.ce', '');
          const tagName = extractTagName(fileContent);

          if (!tagName) {
            console.warn(`⚠️ Could not find custom element tag in ${file}`);
            errorCount++;
            continue;
          }

          const properties = extractLitProperties(fileContent);
          const storybookContent = generateStorybookContent(
            componentName,
            tagName,
            properties
          );

          // Create .stories.ts file in the same directory as the original file
          const outputPath = path.join(fileDir, `${componentName}.stories.ts`);
          fs.writeFileSync(outputPath, storybookContent, 'utf-8');

          console.log(`✅ Generated Storybook file: ${outputPath}`);
          successCount++;
        } catch (error) {
          console.error(`❌ Error processing ${file}: ${(error as Error).message}`);
          errorCount++;
        }
      }

      console.log(`\n✨ Processing complete: ${successCount} files generated successfully, ${errorCount} errors.\n`);
    }

    // Return the original configuration without modifying it
    return config;
  };
}

/**
 * Extracts properties from a LIT component
 * @param fileContent Component file content
 * @returns Object with extracted properties
 */
function extractLitProperties(fileContent: string): Record<string, LitProperty> {
  const properties: Record<string, LitProperty> = {};

  try {
    const ast = parse(fileContent, {
      sourceType: 'module',
      plugins: ['typescript', 'decorators-legacy', 'classProperties']
    });

    traverse(ast, {
      ClassProperty(path) {
        // Check if it's a property with @property or @state decorator
        const decorators = path.node.decorators || [];
        const isLitProperty = decorators.some(decorator => {
          if (t.isCallExpression(decorator.expression)) {
            const callee = decorator.expression.callee;
            return t.isIdentifier(callee) &&
              (callee.name === 'property' || callee.name === 'state');
          }
          return false;
        });

        if (isLitProperty && t.isIdentifier(path.node.key)) {
          const propertyName = path.node.key.name;
          let propertyType = 'any';

          // Try to extract property type
          if (path.node.typeAnnotation &&
            t.isTSTypeAnnotation(path.node.typeAnnotation)) {
            if (t.isTSStringKeyword(path.node.typeAnnotation.typeAnnotation)) {
              propertyType = 'string';
            } else if (t.isTSNumberKeyword(path.node.typeAnnotation.typeAnnotation)) {
              propertyType = 'number';
            } else if (t.isTSBooleanKeyword(path.node.typeAnnotation.typeAnnotation)) {
              propertyType = 'boolean';
            } else if (t.isTSArrayType(path.node.typeAnnotation.typeAnnotation)) {
              propertyType = 'array';
            } else if (t.isTSObjectKeyword(path.node.typeAnnotation.typeAnnotation)) {
              propertyType = 'object';
            }
          }

          // Try to extract default value
          let defaultValue = undefined;
          if (path.node.value) {
            if (t.isStringLiteral(path.node.value)) {
              defaultValue = path.node.value.value;
            } else if (t.isNumericLiteral(path.node.value)) {
              defaultValue = path.node.value.value;
            } else if (t.isBooleanLiteral(path.node.value)) {
              defaultValue = path.node.value.value;
            }
          }

          properties[propertyName] = {
            type: propertyType,
            default: defaultValue
          };
        }
      }
    });
  } catch (error) {
    console.error(`Error parsing file: ${(error as Error).message}`);
  }

  return properties;
}

/**
 * Generates Storybook file content based on extracted properties
 * @param componentName Component name
 * @param tagName Custom element tag name
 * @param properties Extracted properties
 * @returns Storybook file content
 */
function generateStorybookContent(
  componentName: string,
  tagName: string,
  properties: Record<string, LitProperty>
): string {
  const argTypes = Object.entries(properties).map(([name, prop]) => {
    const { type, default: defaultValue } = prop;
    return `    ${name}: {
      control: ${getControlType(type)},
      description: '${name} property',
      ${defaultValue !== undefined ? `defaultValue: ${JSON.stringify(defaultValue)},` : ''}
      table: {
        type: { summary: '${type}' }
      }
    }`;
  }).join(',\n');

  // Import component from same folder
  const importStatement = `import './${componentName}.ce';`;

  return `import { Meta, StoryObj } from '@storybook/web-components';
${importStatement}

const meta: Meta = {
  title: 'Components/${componentName}',
  component: '${tagName}',
  tags: ['autodocs'],
  argTypes: {
${argTypes}
  },
};

export default meta;

export const Primary: StoryObj = {
  args: {
${Object.entries(properties)
      .filter(([_, prop]) => prop.default !== undefined)
      .map(([name, prop]) => `    ${name}: ${JSON.stringify(prop.default)}`)
      .join(',\n')}
  },
};
`;
}

/**
 * Determines the Storybook control type based on property type
 * @param type Property type
 * @returns Corresponding control type
 */
function getControlType(type: string): string {
  switch (type) {
    case 'string':
      return "'text'";
    case 'number':
      return "'number'";
    case 'boolean':
      return "'boolean'";
    case 'array':
      return "'object'";
    case 'object':
      return "'object'";
    default:
      return "'text'";
  }
}

/**
 * Extracts custom element tag name from LIT component
 * @param fileContent Component file content
 * @returns Custom element tag name or null if not found
 */
function extractTagName(fileContent: string): string | null {
  try {
    const ast = parse(fileContent, {
      sourceType: 'module',
      plugins: ['typescript', 'decorators-legacy', 'classProperties']
    });

    let tagName: string | null = null;

    traverse(ast, {
      CallExpression(path) {
        if (t.isIdentifier(path.node.callee) &&
          path.node.callee.name === 'customElement') {
          const args = path.node.arguments;
          if (args.length > 0 && t.isStringLiteral(args[0])) {
            tagName = args[0].value;
          }
        }
      }
    });

    return tagName;
  } catch (error) {
    console.error(`Error extracting tag name: ${(error as Error).message}`);
    return null;
  }
}