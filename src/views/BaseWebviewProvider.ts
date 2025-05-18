import * as vscode from 'vscode';

/**
 * Base class for all webview providers in the extension
 * Provides common functionality for webview setup and management
 */
export abstract class BaseWebviewProvider {
  protected _view?: vscode.WebviewView | vscode.WebviewPanel;
  
  constructor(
    protected readonly _extensionUri: vscode.Uri
  ) {}

  /**
   * Get the nonce for content security policy
   */
  protected getNonce(): string {
    let text = '';
    const possible = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789';
    for (let i = 0; i < 32; i++) {
      text += possible.charAt(Math.floor(Math.random() * possible.length));
    }
    return text;
  }

  /**
   * Get a webview URI for a resource
   * @param webview The webview to get the URI for
   * @param paths Path segments to join to the extension URI
   */
  protected getWebviewUri(webview: vscode.Webview, ...paths: string[]): vscode.Uri {
    return webview.asWebviewUri(vscode.Uri.joinPath(this._extensionUri, ...paths));
  }

  /**
   * Get the webview options
   */
  protected getWebviewOptions(): vscode.WebviewOptions {
    return {
      enableScripts: true,
      localResourceRoots: [this._extensionUri]
    };
  }

  /**
   * Get the Content Security Policy for the webview
   * @param webview The webview to get the CSP for
   * @param nonce The nonce to use for the CSP
   */
  protected getContentSecurityPolicy(webview: vscode.Webview, nonce: string): string {
    return `default-src 'none'; style-src ${webview.cspSource}; font-src ${webview.cspSource}; script-src 'nonce-${nonce}';`;
  }

  /**
   * Get the base HTML for the webview, including common head elements
   * @param webview The webview to get the HTML for
   * @param title The title of the webview
   * @param stylesheets The stylesheets to include
   * @param scripts The scripts to include
   */
  protected getBaseHtml(
    webview: vscode.Webview,
    title: string,
    stylesheets: string[],
    scripts: string[],
    bodyContent: string
  ): string {
    const nonce = this.getNonce();
    const csp = this.getContentSecurityPolicy(webview, nonce);
    
    // Get webview URIs for all resources
    const styleUris = stylesheets.map(stylesheet => this.getWebviewUri(webview, ...stylesheet.split('/')));
    const scriptUris = scripts.map(script => this.getWebviewUri(webview, ...script.split('/')));
    
    // Get the codicons URI
    const codiconsUri = this.getWebviewUri(webview, 'media', 'codicons', 'codicon.css');
    const codiconsFontUri = this.getWebviewUri(webview, 'media', 'codicons', 'codicon.ttf');

    return `<!DOCTYPE html>
    <html lang="en">
    <head>
        <meta charset="UTF-8">
        <meta name="viewport" content="width=device-width, initial-scale=1.0">
        <meta http-equiv="Content-Security-Policy" content="${csp}">
        <style>
            @font-face {
                font-family: "codicon";
                src: url("${codiconsFontUri}") format("truetype");
            }
        </style>
        <link href="${codiconsUri}" rel="stylesheet">
        ${styleUris.map(uri => `<link href="${uri}" rel="stylesheet">`).join('\n        ')}
        <title>${title}</title>
    </head>
    <body>
        ${bodyContent}
        ${scriptUris.map(uri => `<script nonce="${nonce}" src="${uri}"></script>`).join('\n        ')}
    </body>
    </html>`;
  }
  
  /**
   * Get the body content for the webview
   */
  protected abstract getBodyContent(): string;

  /**
   * Get the HTML for the webview
   */
  protected abstract getHtml(webview: vscode.Webview): string;

  /**
   * Dispose the webview
   */
  public dispose(): void {
    // This method can be overridden by subclasses
  }
}