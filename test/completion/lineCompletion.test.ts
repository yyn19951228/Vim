import * as assert from 'assert';

import { getAndUpdateModeHandler } from '../../extension';
import { getCompletionsForCurrentLine } from '../../src/completion/lineCompletionProvider';
import { ModeHandler } from '../../src/mode/modeHandler';
import { Position } from '../../src/common/motion/position';
import { cleanUpWorkspace, setupWorkspace } from '../testUtils';
import { VimState } from '../../src/state/vimState';

suite('Provide line completions', () => {
  let modeHandler: ModeHandler;
  let vimState: VimState;

  setup(async () => {
    await setupWorkspace();
    modeHandler = await getAndUpdateModeHandler();
    vimState = modeHandler.vimState;
  });

  teardown(cleanUpWorkspace);

  const setupTestWithLines = async (lines) => {
    vimState.cursorStopPosition = new Position(0, 0);

    await modeHandler.handleKeyEvent('<Esc>');
    await vimState.editor.edit((builder) => {
      builder.insert(new Position(0, 0), lines.join('\n'));
    });
    await modeHandler.handleMultipleKeyEvents(['<Esc>', 'g', 'g', 'j', 'j', 'A']);
  };

  suite('Line Completion Provider unit tests', () => {
    test('Can complete lines in file, prioritizing above cursor, near cursor', async () => {
      const lines = ['a1', 'a2', 'a', 'a3', 'b1', 'a4'];
      await setupTestWithLines(lines);
      const expectedCompletions = ['a2', 'a1', 'a3', 'a4'];
      const topCompletions = getCompletionsForCurrentLine(
        vimState.cursorStopPosition,
        vimState.editor.document
      )!.slice(0, expectedCompletions.length);

      assert.deepEqual(topCompletions, expectedCompletions, 'Unexpected completions found');
    });

    test('Can complete lines in file with different indentation', async () => {
      const lines = ['a1', '   a 2', 'a', 'a3  ', 'b1', 'a4'];
      await setupTestWithLines(lines);
      const expectedCompletions = ['a 2', 'a1', 'a3  ', 'a4'];
      const topCompletions = getCompletionsForCurrentLine(
        vimState.cursorStopPosition,
        vimState.editor.document
      )!.slice(0, expectedCompletions.length);

      assert.deepEqual(topCompletions, expectedCompletions, 'Unexpected completions found');
    });

    test('Returns no completions for unmatched line', async () => {
      const lines = ['a1', '   a2', 'azzzzzzzzzzzzzzzzzzzzzzzz', 'a3  ', 'b1', 'a4'];
      await setupTestWithLines(lines);
      const expectedCompletions = [];
      const completions = getCompletionsForCurrentLine(
        vimState.cursorStopPosition,
        vimState.editor.document
      )!.slice(0, expectedCompletions.length);

      assert.strictEqual(completions.length, 0, 'Completions found, but none were expected');
    });
  });
});
