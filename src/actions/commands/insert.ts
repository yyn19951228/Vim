import * as vscode from 'vscode';

import { lineCompletionProvider } from '../../completion/lineCompletionProvider';
import { RecordedState } from '../../state/recordedState';
import { VimState } from '../../state/vimState';
import { Position, PositionDiff } from './../../common/motion/position';
import { Range } from './../../common/motion/range';
import { configuration } from './../../configuration/configuration';
import { Mode } from './../../mode/mode';
import { Register, RegisterMode } from './../../register/register';
import { TextEditor } from './../../textEditor';
import { RegisterAction } from './../base';
import { ArrowsInInsertMode } from './../motion';
import {
  BaseCommand,
  CommandInsertAfterCursor,
  CommandInsertAtCursor,
  CommandInsertAtFirstCharacter,
  CommandInsertAtLineEnd,
  DocumentContentChangeAction,
} from './actions';
import { DefaultDigraphs } from './digraphs';
import { Clipboard } from '../../util/clipboard';

@RegisterAction
class CommandEscInsertMode extends BaseCommand {
  modes = [Mode.Insert];
  keys = [['<Esc>'], ['<C-c>'], ['<C-[>']];

  runsOnceForEveryCursor() {
    return false;
  }

  public async exec(position: Position, vimState: VimState): Promise<VimState> {
    vimState.cursors = vimState.cursors.map((x) => x.withNewStop(x.stop.getLeft()));
    if (vimState.returnToInsertAfterCommand && position.character !== 0) {
      vimState.cursors = vimState.cursors.map((x) => x.withNewStop(x.stop.getRight()));
    }

    // only remove leading spaces inserted by vscode.
    // vscode only inserts them when user enter a new line,
    // ie, o/O in Normal mode or \n in Insert mode.
    for (let i = 0; i < vimState.cursors.length; i++) {
      const lastActionBeforeEsc = vimState.keyHistory[vimState.keyHistory.length - 2];
      if (
        ['o', 'O', '\n'].includes(lastActionBeforeEsc) &&
        vimState.editor.document.languageId !== 'plaintext' &&
        /^\s+$/.test(TextEditor.getLineAt(vimState.cursors[i].stop).text)
      ) {
        vimState.recordedState.transformations.push({
          type: 'deleteRange',
          range: new Range(
            vimState.cursors[i].stop.getLineBegin(),
            vimState.cursors[i].stop.getLineEnd()
          ),
        });
        vimState.cursors[i] = vimState.cursors[i].withNewStop(
          vimState.cursors[i].stop.getLineBegin()
        );
      }
    }
    await vimState.setCurrentMode(Mode.Normal);

    // If we wanted to repeat this insert (only for i and a), now is the time to do it. Insert
    // count amount of these strings before returning back to normal mode
    const typeOfInsert =
      vimState.recordedState.actionsRun[vimState.recordedState.actionsRun.length - 3];
    const isTypeToRepeatInsert =
      typeOfInsert instanceof CommandInsertAtCursor ||
      typeOfInsert instanceof CommandInsertAfterCursor ||
      typeOfInsert instanceof CommandInsertAtLineEnd ||
      typeOfInsert instanceof CommandInsertAtFirstCharacter;

    // If this is the type to repeat insert, do this now
    if (vimState.recordedState.count > 1 && isTypeToRepeatInsert) {
      const changeAction = vimState.recordedState.actionsRun[
        vimState.recordedState.actionsRun.length - 2
      ] as DocumentContentChangeAction;

      const docChanges = changeAction.contentChanges.map((change) => change.textDiff);

      // Add count amount of inserts in the case of 4i=<esc>
      for (let i = 0; i < vimState.recordedState.count - 1; i++) {
        // If this is the last transform, move cursor back one character
        const positionDiff =
          i === vimState.recordedState.count - 2
            ? new PositionDiff({ character: -1 })
            : new PositionDiff();

        // Add a transform containing the change
        vimState.recordedState.transformations.push({
          type: 'contentChange',
          changes: docChanges,
          diff: positionDiff,
        });
      }
    }

    if (vimState.historyTracker.currentContentChanges.length > 0) {
      vimState.historyTracker.lastContentChanges = vimState.historyTracker.currentContentChanges;
      vimState.historyTracker.currentContentChanges = [];
    }

    if (vimState.isFakeMultiCursor) {
      vimState.cursors = [vimState.cursors[0]];
      vimState.isMultiCursor = false;
      vimState.isFakeMultiCursor = false;
    }
    return vimState;
  }
}

@RegisterAction
export class CommandInsertPreviousText extends BaseCommand {
  modes = [Mode.Insert];
  keys = ['<C-a>'];

  public async exec(position: Position, vimState: VimState): Promise<VimState> {
    let actions = ((await Register.getByKey('.')).text as RecordedState).actionsRun.slice(0);
    // let actions = Register.lastContentChange.actionsRun.slice(0);
    // The first action is entering Insert Mode, which is not necessary in this case
    actions.shift();
    // The last action is leaving Insert Mode, which is not necessary in this case
    // actions.pop();

    if (actions.length > 0 && actions[0] instanceof ArrowsInInsertMode) {
      // Note, arrow keys are the only Insert action command that can't be repeated here as far as @rebornix knows.
      actions.shift();
    }

    for (let action of actions) {
      if (action instanceof BaseCommand) {
        vimState = await action.execCount(vimState.cursorStopPosition, vimState);
      }

      if (action instanceof DocumentContentChangeAction) {
        vimState = await action.exec(vimState.cursorStopPosition, vimState);
      }
    }

    vimState.cursorStopPosition = Position.FromVSCodePosition(vimState.editor.selection.end);
    vimState.cursorStartPosition = Position.FromVSCodePosition(vimState.editor.selection.start);
    await vimState.setCurrentMode(Mode.Insert);
    return vimState;
  }
}

@RegisterAction
class CommandInsertPreviousTextAndQuit extends BaseCommand {
  modes = [Mode.Insert];
  keys = ['<C-shift+2>']; // <C-@>

  public async exec(position: Position, vimState: VimState): Promise<VimState> {
    vimState = await new CommandInsertPreviousText().exec(position, vimState);
    await vimState.setCurrentMode(Mode.Normal);
    return vimState;
  }
}

@RegisterAction
class CommandInsertBelowChar extends BaseCommand {
  modes = [Mode.Insert];
  keys = ['<C-e>'];

  public async exec(position: Position, vimState: VimState): Promise<VimState> {
    if (TextEditor.isLastLine(position)) {
      return vimState;
    }

    const charBelowCursorPosition = position.getDown();

    if (charBelowCursorPosition.isLineEnd()) {
      return vimState;
    }

    const char = TextEditor.getText(
      new vscode.Range(charBelowCursorPosition, charBelowCursorPosition.getRight())
    );
    await TextEditor.insert(char, position);

    vimState.cursorStartPosition = Position.FromVSCodePosition(vimState.editor.selection.start);
    vimState.cursorStopPosition = Position.FromVSCodePosition(vimState.editor.selection.start);

    return vimState;
  }
}

@RegisterAction
class CommandInsertIndentInCurrentLine extends BaseCommand {
  modes = [Mode.Insert];
  keys = ['<C-t>'];

  public async exec(position: Position, vimState: VimState): Promise<VimState> {
    const originalText = TextEditor.getLineAt(position).text;
    const indentationWidth = TextEditor.getIndentationLevel(originalText);
    const tabSize = configuration.tabstop || Number(vimState.editor.options.tabSize);
    const newIndentationWidth = (indentationWidth / tabSize + 1) * tabSize;

    vimState.recordedState.transformations.push({
      type: 'replaceText',
      text: TextEditor.setIndentationLevel(originalText, newIndentationWidth),
      start: position.getLineBegin(),
      end: position.getLineEnd(),
      diff: new PositionDiff({ character: newIndentationWidth - indentationWidth }),
    });

    return vimState;
  }
}

// Upon thinking about it some more, I'm not really sure how to fix this
// elegantly. Tab is just used for so many things in the VSCode editor, and all
// of them happen to be overloaded. Sometimes tab does a tab, sometimes it does
// an emmet completion, sometimes a snippet completion, etc.
// @RegisterAction
// export class CommandInsertTabInInsertMode extends BaseCommand {
//   modes = [ModeName.Insert];
//   keys = ["<tab>"];
//   runsOnceForEveryCursor() { return false; }

//   public async exec(position: Position, vimState: VimState): Promise<VimState> {
//     vimState.recordedState.transformations.push({
//       type: "tab"
//     });
//     return vimState;
//   }
// }

@RegisterAction
export class CommandBackspaceInInsertMode extends BaseCommand {
  modes = [Mode.Insert];
  keys = ['<BS>'];

  public async exec(position: Position, vimState: VimState): Promise<VimState> {
    const line = TextEditor.getLineAt(position).text;
    const selection = vimState.editor.selections.find((s) => s.contains(position));

    if (selection && !selection.isEmpty) {
      // If a selection is active, delete it
      vimState.recordedState.transformations.push({
        type: 'deleteRange',
        range: new Range(selection.start as Position, selection.end as Position),
      });
    } else if (
      position.character > 0 &&
      line.length > 0 &&
      line.match(/^\s+$/) &&
      configuration.expandtab
    ) {
      // If the line is empty except whitespace and we're not on the first
      // character of the line, backspace should return to the next lowest
      // level of indentation.
      // TODO: similar logic is needed for whitespace at the start or end of a line. See #1691

      const tabSize = vimState.editor.options.tabSize as number;
      const desiredLineLength = Math.floor((position.character - 1) / tabSize) * tabSize;

      vimState.recordedState.transformations.push({
        type: 'deleteRange',
        range: new Range(position.withColumn(desiredLineLength), position.withColumn(line.length)),
      });
    } else if (!position.isAtDocumentBegin()) {
      // Otherwise, just delete a character (unless we're at the start of the document)
      vimState.recordedState.transformations.push({
        type: 'deleteText',
        position: position,
      });
    }

    vimState.cursorStopPosition = vimState.cursorStopPosition.getLeft();
    vimState.cursorStartPosition = vimState.cursorStartPosition.getLeft();
    return vimState;
  }
}

@RegisterAction
export class CommandDeleteInInsertMode extends BaseCommand {
  modes = [Mode.Insert];
  keys = ['<Del>'];

  public async exec(position: Position, vimState: VimState): Promise<VimState> {
    const selection = TextEditor.getSelection();

    if (!selection.isEmpty) {
      // If a selection is active, delete it
      vimState.recordedState.transformations.push({
        type: 'deleteRange',
        range: new Range(selection.start as Position, selection.end as Position),
      });
    } else if (!position.isAtDocumentEnd()) {
      // Otherwise, just delete a character (unless we're at the end of the document)
      vimState.recordedState.transformations.push({
        type: 'deleteText',
        position: position.getRightThroughLineBreaks(true),
      });
    }
    return vimState;
  }
}

@RegisterAction
export class CommandInsertInInsertMode extends BaseCommand {
  modes = [Mode.Insert];
  keys = ['<character>'];

  public async exec(position: Position, vimState: VimState): Promise<VimState> {
    const char = this.keysPressed[this.keysPressed.length - 1];

    vimState.recordedState.transformations.push({
      type: 'insertTextVSCode',
      text: char,
      isMultiCursor: vimState.isMultiCursor,
    });

    return vimState;
  }

  public toString(): string {
    return this.keysPressed[this.keysPressed.length - 1];
  }
}

@RegisterAction
class CommandInsertDigraph extends BaseCommand {
  modes = [Mode.Insert];
  keys = ['<C-k>', '<any>', '<any>'];
  isCompleteAction = false;

  public async exec(position: Position, vimState: VimState): Promise<VimState> {
    const digraph = this.keysPressed.slice(1, 3).join('');
    const reverseDigraph = digraph.split('').reverse().join('');
    let charCodes = (DefaultDigraphs[digraph] ||
      DefaultDigraphs[reverseDigraph] ||
      configuration.digraphs[digraph] ||
      configuration.digraphs[reverseDigraph])[1];
    if (!(charCodes instanceof Array)) {
      charCodes = [charCodes];
    }
    const char = String.fromCharCode(...charCodes);
    await TextEditor.insertAt(char, position);
    await vimState.setCurrentMode(Mode.Insert);
    vimState.cursorStartPosition = Position.FromVSCodePosition(vimState.editor.selection.start);
    vimState.cursorStopPosition = Position.FromVSCodePosition(vimState.editor.selection.start);

    return vimState;
  }

  public doesActionApply(vimState: VimState, keysPressed: string[]): boolean {
    if (!super.doesActionApply(vimState, keysPressed)) {
      return false;
    }
    const chars = keysPressed.slice(1, 3).join('');
    const reverseChars = chars.split('').reverse().join('');
    return (
      chars in configuration.digraphs ||
      reverseChars in configuration.digraphs ||
      chars in DefaultDigraphs ||
      reverseChars in DefaultDigraphs
    );
  }

  public couldActionApply(vimState: VimState, keysPressed: string[]): boolean {
    if (!super.couldActionApply(vimState, keysPressed)) {
      return false;
    }
    const chars = keysPressed.slice(1, keysPressed.length).join('');
    const reverseChars = chars.split('').reverse().join('');
    if (chars.length > 0) {
      const predicate = (digraph: string) => {
        const digraphChars = digraph.substring(0, chars.length);
        return chars === digraphChars || reverseChars === digraphChars;
      };
      const match =
        Object.keys(configuration.digraphs).find(predicate) ||
        Object.keys(DefaultDigraphs).find(predicate);
      return match !== undefined;
    }
    return true;
  }
}

@RegisterAction
class CommandInsertRegisterContent extends BaseCommand {
  modes = [Mode.Insert];
  keys = ['<C-r>', '<character>'];
  isCompleteAction = false;

  public async exec(position: Position, vimState: VimState): Promise<VimState> {
    vimState.recordedState.registerName = this.keysPressed[1];
    const register = await Register.get(vimState);
    let text: string;

    if (register.text instanceof Array) {
      text = (register.text as string[]).join('\n');
    } else if (register.text instanceof RecordedState) {
      vimState.recordedState.transformations.push({
        type: 'macro',
        register: vimState.recordedState.registerName,
        replay: 'keystrokes',
      });

      return vimState;
    } else {
      text = register.text;
    }

    if (register.registerMode === RegisterMode.LineWise) {
      text += '\n';
    }

    await TextEditor.insertAt(text, position);
    await vimState.setCurrentMode(Mode.Insert);
    vimState.cursorStartPosition = Position.FromVSCodePosition(vimState.editor.selection.start);
    vimState.cursorStopPosition = Position.FromVSCodePosition(vimState.editor.selection.start);

    return vimState;
  }

  public doesActionApply(vimState: VimState, keysPressed: string[]): boolean {
    const register = keysPressed[1];

    return super.doesActionApply(vimState, keysPressed) && Register.isValidRegister(register);
  }

  public couldActionApply(vimState: VimState, keysPressed: string[]): boolean {
    const register = keysPressed[1];

    return super.couldActionApply(vimState, keysPressed) && Register.isValidRegister(register);
  }
}

@RegisterAction
export class CommandOneNormalCommandInInsertMode extends BaseCommand {
  modes = [Mode.Insert];
  keys = ['<C-o>'];

  public async exec(position: Position, vimState: VimState): Promise<VimState> {
    vimState.returnToInsertAfterCommand = true;
    return new CommandEscInsertMode().exec(position, vimState);
  }
}

@RegisterAction
class CommandCtrlW extends BaseCommand {
  modes = [Mode.Insert];
  keys = ['<C-w>'];

  public async exec(position: Position, vimState: VimState): Promise<VimState> {
    let wordBegin: Position;
    if (position.isInLeadingWhitespace()) {
      wordBegin = position.getLineBegin();
    } else if (position.isLineBeginning()) {
      wordBegin = position.getPreviousLineBegin().getLineEnd();
    } else {
      wordBegin = position.getWordLeft();
    }

    await TextEditor.delete(new vscode.Range(wordBegin, position));

    vimState.cursorStopPosition = wordBegin;

    return vimState;
  }
}

@RegisterAction
class CommandDeleteIndentInCurrentLine extends BaseCommand {
  modes = [Mode.Insert];
  keys = ['<C-d>'];

  public async exec(position: Position, vimState: VimState): Promise<VimState> {
    const originalText = TextEditor.getLineAt(position).text;
    const indentationWidth = TextEditor.getIndentationLevel(originalText);

    if (indentationWidth === 0) {
      return vimState;
    }

    const tabSize = configuration.tabstop;
    const newIndentationWidth = (indentationWidth / tabSize - 1) * tabSize;

    await TextEditor.replace(
      new vscode.Range(position.getLineBegin(), position.getLineEnd()),
      TextEditor.setIndentationLevel(
        originalText,
        newIndentationWidth < 0 ? 0 : newIndentationWidth
      )
    );

    const cursorPosition = Position.FromVSCodePosition(
      position.with(
        position.line,
        position.character + (newIndentationWidth - indentationWidth) / tabSize
      )
    );
    vimState.cursorStopPosition = cursorPosition;
    vimState.cursorStartPosition = cursorPosition;
    await vimState.setCurrentMode(Mode.Insert);
    return vimState;
  }
}

@RegisterAction
class CommandInsertAboveChar extends BaseCommand {
  modes = [Mode.Insert];
  keys = ['<C-y>'];

  public async exec(position: Position, vimState: VimState): Promise<VimState> {
    if (TextEditor.isFirstLine(position)) {
      return vimState;
    }

    const charAboveCursorPosition = position.getUp(1);

    if (charAboveCursorPosition.isLineEnd()) {
      return vimState;
    }

    const char = TextEditor.getText(
      new vscode.Range(charAboveCursorPosition, charAboveCursorPosition.getRight())
    );
    await TextEditor.insert(char, position);

    vimState.cursorStartPosition = Position.FromVSCodePosition(vimState.editor.selection.start);
    vimState.cursorStopPosition = Position.FromVSCodePosition(vimState.editor.selection.start);

    return vimState;
  }
}

@RegisterAction
class CommandCtrlHInInsertMode extends BaseCommand {
  modes = [Mode.Insert];
  keys = ['<C-h>'];

  public async exec(position: Position, vimState: VimState): Promise<VimState> {
    vimState.recordedState.transformations.push({
      type: 'deleteText',
      position: position,
    });

    return vimState;
  }
}

@RegisterAction
class CommandCtrlUInInsertMode extends BaseCommand {
  modes = [Mode.Insert];
  keys = ['<C-u>'];

  public async exec(position: Position, vimState: VimState): Promise<VimState> {
    const start = position.isInLeadingWhitespace()
      ? position.getLineBegin()
      : position.getLineBeginRespectingIndent();
    await TextEditor.delete(new vscode.Range(start, position));
    vimState.cursorStopPosition = start;
    vimState.cursorStartPosition = start;
    return vimState;
  }
}

@RegisterAction
class CommandNavigateAutocompleteDown extends BaseCommand {
  modes = [Mode.Insert];
  keys = [['<C-n>'], ['<C-j>']];

  public async exec(position: Position, vimState: VimState): Promise<VimState> {
    /* if we're in a multi cursor state, we check to see if the current active text selection
     * is the same as the position we've been passed when we exec this function
     * this has the effect of only ever executing `selectNextSuggestion` once.
     * without this we execute it once per multi cursor, meaning it skips over the autocomplete
     * list suggestions
     */
    if (vimState.isMultiCursor && vscode.window.activeTextEditor) {
      const selection = vscode.window.activeTextEditor.selections[0];
      if (
        selection.active.line === position.line &&
        selection.active.character === position.character
      ) {
        await vscode.commands.executeCommand('selectNextSuggestion');
      }
    } else {
      await vscode.commands.executeCommand('selectNextSuggestion');
    }

    return vimState;
  }
}

@RegisterAction
class CommandNavigateAutocompleteUp extends BaseCommand {
  modes = [Mode.Insert];
  keys = ['<C-p>'];

  public async exec(position: Position, vimState: VimState): Promise<VimState> {
    /* if we're in a multi cursor state, we check to see if the current active text selection
     * is the same as the position we've been passed when we exec this function
     * this has the effect of only ever executing `selectPrevSuggestion` once.
     * without this we execute it once per multi cursor, meaning it skips over the autocomplete
     * list suggestions
     */
    if (vimState.isMultiCursor && vscode.window.activeTextEditor) {
      const selection = vscode.window.activeTextEditor.selections[0];
      if (
        selection.active.line === position.line &&
        selection.active.character === position.character
      ) {
        await vscode.commands.executeCommand('selectPrevSuggestion');
      }
    } else {
      await vscode.commands.executeCommand('selectPrevSuggestion');
    }

    return vimState;
  }
}

@RegisterAction
class CommandCtrlVInInsertMode extends BaseCommand {
  modes = [Mode.Insert];
  keys = ['<C-v>'];

  public async exec(position: Position, vimState: VimState): Promise<VimState> {
    const textFromClipboard = await Clipboard.Paste();

    vimState.recordedState.transformations.push({
      type: 'deleteRange',
      range: new Range(vimState.cursorStartPosition, vimState.cursorStopPosition),
    });

    if (vimState.isMultiCursor) {
      vimState.recordedState.transformations.push({
        type: 'insertText',
        text: textFromClipboard,
        position: vimState.cursorStopPosition,
      });
    } else {
      vimState.recordedState.transformations.push({
        type: 'insertTextVSCode',
        text: textFromClipboard,
      });
    }

    return vimState;
  }
}

@RegisterAction
class CommandShowLineAutocomplete extends BaseCommand {
  modes = [Mode.Insert];
  keys = ['<C-x>', '<C-l>'];
  runsOnceForEveryCursor() {
    return false;
  }

  public async exec(position: Position, vimState: VimState): Promise<VimState> {
    await lineCompletionProvider.showLineCompletionsQuickPick(position, vimState);
    return vimState;
  }
}
