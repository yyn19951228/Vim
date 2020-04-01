import * as vscode from 'vscode';
import { Mode, statusBarText, statusBarCommandText } from './mode/mode';
import { configuration } from './configuration/configuration';
import { VimState } from './state/vimState';
import { VimError } from './error';

class StatusBarImpl implements vscode.Disposable {
  // Displays the current state (mode, recording macro, etc.) and messages to the user
  private _statusBarItem: vscode.StatusBarItem;

  // Displays the keys you've typed so far when they haven't yet resolved to a command
  private _recordedStateStatusBarItem: vscode.StatusBarItem;

  private _previousModeName: Mode | undefined = undefined;
  private _showingDefaultMessage = true;

  constructor() {
    this._statusBarItem = vscode.window.createStatusBarItem(
      vscode.StatusBarAlignment.Left,
      Number.MIN_SAFE_INTEGER // Furthest right on the left
    );
    this._statusBarItem.show();

    this._recordedStateStatusBarItem = vscode.window.createStatusBarItem(
      vscode.StatusBarAlignment.Right,
      Number.MAX_SAFE_INTEGER // Furthest left on the right
    );
    this._recordedStateStatusBarItem.show();
  }

  dispose() {
    this._statusBarItem.dispose();
    this._recordedStateStatusBarItem.dispose();
  }

  /**
   * Updates the status bar text
   * @param isError If true, text rendered in red
   */
  public setText(vimState: VimState, text: string, isError = false) {
    const hasModeChanged = vimState.currentMode !== this._previousModeName;

    // Text
    this.updateText(text);

    // Foreground color
    if (!configuration.statusBarColorControl) {
      this._statusBarItem.color = isError ? new vscode.ThemeColor('errorForeground') : undefined;
    }

    // Background color
    const shouldUpdateColor = configuration.statusBarColorControl && hasModeChanged;
    if (shouldUpdateColor) {
      this.updateColor(vimState.currentMode);
    }

    this._previousModeName = vimState.currentMode;
    this._showingDefaultMessage = false;
  }

  public displayError(vimState: VimState, error: VimError) {
    StatusBar.setText(vimState, error.toString(), true);
  }

  public getText() {
    return this._statusBarItem.text.replace(/\^M/g, '\n');
  }

  /**
   * Clears any messages from the status bar, leaving the default info, such as
   * the current mode and macro being recorded.
   * @param force If true, will clear even high priority messages like errors.
   */
  public clear(vimState: VimState, force = true) {
    if (!this._showingDefaultMessage && !force) {
      return;
    }

    let text: string[] = [];

    if (configuration.showmodename) {
      text.push(statusBarText(vimState));
      if (vimState.isMultiCursor) {
        text.push(' MULTI CURSOR ');
      }
    }

    if (configuration.showcmd) {
      this._recordedStateStatusBarItem.text = statusBarCommandText(vimState);
    }

    if (vimState.isRecordingMacro) {
      const macroText = 'Recording @' + vimState.recordedMacro.registerName;
      text.push(macroText);
    }

    StatusBar.setText(vimState, text.join(' '));

    this._showingDefaultMessage = true;
  }

  private updateText(text: string) {
    const escaped = text.replace(/\n/g, '^M');
    this._statusBarItem.text = escaped || '';
  }

  private updateColor(mode: Mode) {
    let foreground: string | undefined = undefined;
    let background: string | undefined = undefined;

    let colorToSet = configuration.statusBarColors[Mode[mode].toLowerCase()];

    if (colorToSet !== undefined) {
      if (typeof colorToSet === 'string') {
        background = colorToSet;
      } else {
        [background, foreground] = colorToSet;
      }
    }

    const workbenchConfiguration = configuration.getConfiguration('workbench');
    const currentColorCustomizations = workbenchConfiguration.get('colorCustomizations');

    const colorCustomizations = Object.assign({}, currentColorCustomizations || {}, {
      'statusBar.background': `${background}`,
      'statusBar.noFolderBackground': `${background}`,
      'statusBar.debuggingBackground': `${background}`,
      'statusBar.foreground': `${foreground}`,
    });

    // If colors are undefined, return to VSCode defaults
    if (background === undefined) {
      delete colorCustomizations['statusBar.background'];
      delete colorCustomizations['statusBar.noFolderBackground'];
      delete colorCustomizations['statusBar.debuggingBackground'];
    }

    if (foreground === undefined) {
      delete colorCustomizations['statusBar.foreground'];
    }

    if (currentColorCustomizations !== colorCustomizations) {
      workbenchConfiguration.update('colorCustomizations', colorCustomizations, true);
    }
  }
}

export const StatusBar = new StatusBarImpl();
