import { Fragment, isValidElement } from './react';
import type { ReactNode } from './react';

const voidElements = new Set([
  'area',
  'base',
  'br',
  'col',
  'embed',
  'hr',
  'img',
  'input',
  'link',
  'meta',
  'param',
  'source',
  'track',
  'wbr',
]);

function escapeHtml(value: string): string {
  return value
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

function attrName(name: string): string {
  if (name === 'className') return 'class';
  if (name === 'htmlFor') return 'for';
  return name;
}

function styleValue(style: Record<string, string | number>): string {
  return Object.entries(style)
    .map(([key, value]) => `${key.replace(/[A-Z]/g, (letter) => `-${letter.toLowerCase()}`)}:${value}`)
    .join(';');
}

function renderAttrs(props: Record<string, unknown>): string {
  return Object.entries(props)
    .filter(([name]) => name !== 'children' && name !== 'ref' && !name.startsWith('on'))
    .flatMap(([name, value]) => {
      if (value === undefined || value === null || value === false || typeof value === 'function') {
        return [];
      }
      if (value === true) {
        return [attrName(name)];
      }
      if (name === 'style' && typeof value === 'object' && !Array.isArray(value)) {
        return [`style="${escapeHtml(styleValue(value as Record<string, string | number>))}"`];
      }
      return [`${attrName(name)}="${escapeHtml(String(value))}"`];
    })
    .join(' ');
}

function renderNode(node: ReactNode): string {
  if (node === null || node === undefined || typeof node === 'boolean') return '';
  if (typeof node === 'string' || typeof node === 'number') return escapeHtml(String(node));
  if (Array.isArray(node)) return node.map(renderNode).join('');
  if (!isValidElement(node)) return '';

  const element = node;
  if (typeof element.type === 'function') {
    return renderNode(element.type(element.props, undefined));
  }
  if (element.type === Fragment) {
    return renderNode(element.props.children as ReactNode);
  }
  if (typeof element.type !== 'string') return '';

  if ('dangerouslySetInnerHTML' in element.props) {
    const html = element.props.dangerouslySetInnerHTML as { __html?: string };
    const attrs = renderAttrs(element.props);
    return `<${element.type}${attrs ? ` ${attrs}` : ''}>${html.__html ?? ''}</${element.type}>`;
  }

  const attrs = renderAttrs(element.props);
  const open = `<${element.type}${attrs ? ` ${attrs}` : ''}>`;
  if (voidElements.has(element.type)) return open;

  return `${open}${renderNode(element.props.children as ReactNode)}</${element.type}>`;
}

export function renderToStaticMarkup(node: ReactNode): string {
  return renderNode(node);
}
