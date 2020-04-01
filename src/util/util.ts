import * as vscode from 'vscode';
import { Position } from '../common/motion/position';
import { Range } from '../common/motion/range';
import { exec } from 'child_process';
import { VimState } from '../state/vimState';

/**
 * We used to have an issue where we would do something like execute a VSCode
 * command, and would encounter race conditions because the cursor positions
 * wouldn't yet be updated. So we waited for a selection change event, but
 * this doesn't seem to be necessary any more.
 */
export function getCursorsAfterSync(): Range[] {
  return vscode.window.activeTextEditor!.selections.map(
    (x) => new Range(Position.FromVSCodePosition(x.start), Position.FromVSCodePosition(x.end))
  );
}

/**
 * This function executes a shell command and returns the standard output as a string.
 */
export function executeShell(cmd: string): Promise<string> {
  return new Promise<string>((resolve, reject) => {
    try {
      exec(cmd, (err, stdout, stderr) => {
        if (err) {
          reject(err);
        } else {
          resolve(stdout);
        }
      });
    } catch (error) {
      reject(error);
    }
  });
}

export function clamp(num: number, min: number, max: number) {
  return Math.min(Math.max(num, min), max);
}

export function scrollView(vimState: VimState, offset: number) {
  if (offset !== 0) {
    vimState.postponedCodeViewChanges.push({
      command: 'editorScroll',
      args: {
        to: offset > 0 ? 'up' : 'down',
        by: 'line',
        value: Math.abs(offset),
        revealCursor: false,
        select: false,
      },
    });
  }
}
