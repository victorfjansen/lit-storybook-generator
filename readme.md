# Vite Plugin LIT Storybook

A Vite plugin that analyzes LIT components and automatically generates Storybook `.stories.ts` files.

## Features

- ✅ Extracts LIT component properties decorated with `@property` and `@state`
- ✅ Automatically detects custom element tag name from `@customElement` decorator
- ✅ Generates `.stories.ts` files in the same directory as the original components
- ✅ Correctly configures controls based on property types
- ✅ Integrates directly into `.storybook/main.ts`

## Installation

```bash
npm install --save-dev lit-storybook-generator
```

### Dependencies

This plugin requires the following dependencies:

```bash
npm install --save-dev @babel/parser @babel/traverse @babel/types glob @types/babel__traverse @types/glob
```

## Configuration

### 1. Configure Storybook

Modify your `.storybook/main.ts` file to use the plugin:

```typescript
import type { StorybookConfig } from '@storybook/web-components-vite';
import { mergeConfig } from 'vite';
import { litStorybookGenerator } from 'lit-storybook-generator';

const config: StorybookConfig = {
  stories: [
    '../src/**/*.stories.mdx',
    '../src/**/*.stories.@(js|jsx|ts|tsx)'
  ],
  addons: [
    '@storybook/addon-links',
    '@storybook/addon-essentials',
  ],
  framework: {
    name: '@storybook/web-components-vite',
    options: {},
  },
  docs: {
    autodocs: 'tag',
  },
  viteFinal: async (config) => {
    // Apply the LIT stories generator
    const updatedConfig = await litStorybookGenerator({
      pattern: '**/src/**/*.ce.ts'  // Adjust this pattern according to your file structure
    })(config);
    
    return mergeConfig(updatedConfig, {
      // Additional Vite configurations, if needed
    });
  },
};

export default config;
```

### 2. Configure Plugin Options

The plugin accepts the following options:

| Option | Type | Description | Example |
|-------|------|-----------|---------|
| `pattern` | `string` | Glob pattern to find LIT files | `"**/src/**/*.ce.ts"` |

## How It Works

When Storybook is started or built, the plugin:

1. Searches for all files matching the provided pattern
2. Analyzes each file to extract:
   - The custom element tag name (from the `@customElement` decorator)
   - Properties decorated with `@property` and `@state`
   - Types and default values of these properties
3. Generates a `.stories.ts` file for each component in the same directory as the original file

## Example

### Original LIT Component (`my-button.ce.ts`):

```typescript
import { LitElement, html } from 'lit';
import { customElement, property } from 'lit/decorators.js';

@customElement('my-button')
export class MyButton extends LitElement {
  @property({ type: String })
  label: string = 'Click me';

  @property({ type: Boolean })
  primary: boolean = false;

  render() {
    return html`
      <button class="${this.primary ? 'primary' : 'secondary'}">
        ${this.label}
      </button>
    `;
  }
}
```

### Generated Storybook File (`my-button.stories.ts`):

```typescript
import { Meta, StoryObj } from '@storybook/web-components';
import './my-button.ce';

const meta: Meta = {
  title: 'Components/my-button',
  component: 'my-button',
  tags: ['autodocs'],
  argTypes: {
    label: {
      control: 'text',
      description: 'label property',
      defaultValue: 'Click me',
      table: {
        type: { summary: 'string' }
      }
    },
    primary: {
      control: 'boolean',
      description: 'primary property',
      defaultValue: false,
      table: {
        type: { summary: 'boolean' }
      }
    }
  },
};

export default meta;

export const Primary: StoryObj = {
  args: {
    label: 'Click me',
    primary: false
  },
};
```

## Tips and Troubleshooting

- Make sure the glob pattern in `pattern` is correct to find your LIT components
- Verify that the `stories` configuration in your `.storybook/main.ts` includes the path where `.stories.ts` files are generated
- To force regeneration of files, delete existing `.stories.ts` files before starting Storybook
- For debugging, check the console during Storybook initialization to see the plugin logs

## License

MIT