import * as assert from 'assert';
import { Position } from './../src/common/motion/position';
import { TextEditor } from './../src/textEditor';
import { cleanUpWorkspace, setupWorkspace } from './testUtils';

suite('basic motion', () => {
  const text: string[] = ['mary had', 'a', 'little lamb', ' whose fleece was '];

  suiteSetup(async () => {
    await setupWorkspace();
    await TextEditor.insert(text.join('\n'));
  });

  suiteTeardown(cleanUpWorkspace);

  test('char right: should move one column right', () => {
    const position = new Position(0, 0);
    assert.strictEqual(position.line, 0);
    assert.strictEqual(position.character, 0);

    const next = position.getRight();
    assert.strictEqual(next.line, 0);
    assert.strictEqual(next.character, 1);
  });

  test('char right', () => {
    const motion = new Position(0, 8).getRight();

    assert.strictEqual(motion.line, 0);
    assert.strictEqual(motion.character, 8);
  });

  test('char left: should move cursor one column left', () => {
    let position = new Position(0, 5);
    assert.strictEqual(position.line, 0);
    assert.strictEqual(position.character, 5);

    position = position.getLeft();
    assert.strictEqual(position.line, 0);
    assert.strictEqual(position.character, 4);
  });

  test('char left: left-most column should stay at the same location', () => {
    let motion = new Position(0, 0);
    assert.strictEqual(motion.line, 0);
    assert.strictEqual(motion.character, 0);

    motion = motion.getLeft();
    assert.strictEqual(motion.line, 0);
    assert.strictEqual(motion.character, 0);
  });

  test('line down: should move cursor one line down', () => {
    let motion = new Position(1, 0);
    assert.strictEqual(motion.line, 1);
    assert.strictEqual(motion.character, 0);

    motion = motion.getDownWithDesiredColumn(0);
    assert.strictEqual(motion.line, 2);
    assert.strictEqual(motion.character, 0);
  });

  test('line down: bottom-most line should stay at the same location', () => {
    let motion = new Position(3, 0);
    assert.strictEqual(motion.line, 3);
    assert.strictEqual(motion.character, 0);

    motion = motion.getDownWithDesiredColumn(3);
    assert.strictEqual(motion.line, 3);
    assert.strictEqual(motion.character, 0);
  });

  suite('line up', () => {
    test('should move cursor one line up', () => {
      let position = new Position(1, 0);
      assert.strictEqual(position.line, 1);
      assert.strictEqual(position.character, 0);

      position = position.getUpWithDesiredColumn(0);
      assert.strictEqual(position.line, 0);
      assert.strictEqual(position.character, 0);
    });

    test('top-most line should stay at the same location', () => {
      let motion = new Position(0, 1);
      assert.strictEqual(motion.line, 0);
      assert.strictEqual(motion.character, 1);

      motion = motion.getUpWithDesiredColumn(0);
      assert.strictEqual(motion.line, 0);
      assert.strictEqual(motion.character, 1);
    });
  });

  test('line begin', () => {
    const motion = new Position(0, 3).getLineBegin();
    assert.strictEqual(motion.line, 0);
    assert.strictEqual(motion.character, 0);
  });

  test('line end', () => {
    let motion = new Position(0, 0).getLineEnd();
    assert.strictEqual(motion.line, 0);
    assert.strictEqual(motion.character, text[0].length);

    motion = new Position(2, 0).getLineEnd();
    assert.strictEqual(motion.line, 2);
    assert.strictEqual(motion.character, text[2].length);
  });

  test('document begin', () => {
    const motion = TextEditor.getDocumentBegin();
    assert.strictEqual(motion.line, 0);
    assert.strictEqual(motion.character, 0);
  });

  test('document end', () => {
    const motion = TextEditor.getDocumentEnd();
    assert.strictEqual(motion.line, text.length - 1);
    assert.strictEqual(motion.character, text[text.length - 1].length);
  });

  test('line begin cursor on first non-blank character', () => {
    const motion = TextEditor.getFirstNonWhitespaceCharOnLine(0);
    assert.strictEqual(motion.line, 0);
    assert.strictEqual(motion.character, 0);
  });

  test('last line begin cursor on first non-blank character', () => {
    const motion = TextEditor.getFirstNonWhitespaceCharOnLine(3);
    assert.strictEqual(motion.line, 3);
    assert.strictEqual(motion.character, 1);
  });
});

suite('word motion', () => {
  const text: string[] = [
    'if (true) {',
    '  return true;',
    '} else {',
    '',
    '  return false;',
    '  ',
    '} // endif',
  ];

  suiteSetup(() => {
    return setupWorkspace().then(() => {
      return TextEditor.insert(text.join('\n'));
    });
  });

  suiteTeardown(cleanUpWorkspace);

  suite('word right', () => {
    test('move to word right', () => {
      const motion = new Position(0, 3).getWordRight();
      assert.strictEqual(motion.line, 0);
      assert.strictEqual(motion.character, 4);
    });

    test('last word should move to next line', () => {
      const motion = new Position(0, 10).getWordRight();
      assert.strictEqual(motion.line, 1);
      assert.strictEqual(motion.character, 2);
    });

    test('last word should move to next line stops on empty line', () => {
      const motion = new Position(2, 7).getWordRight();
      assert.strictEqual(motion.line, 3);
      assert.strictEqual(motion.character, 0);
    });

    test('last word should move to next line skips whitespace only line', () => {
      const motion = new Position(4, 14).getWordRight();
      assert.strictEqual(motion.line, 6);
      assert.strictEqual(motion.character, 0);
    });

    test('last word on last line should go to end of document (special case!)', () => {
      const motion = new Position(6, 6).getWordRight();
      assert.strictEqual(motion.line, 6);
      assert.strictEqual(motion.character, 10);
    });
  });

  suite('word left', () => {
    test('move cursor word left across spaces', () => {
      const motion = new Position(0, 3).getWordLeft();
      assert.strictEqual(motion.line, 0);
      assert.strictEqual(motion.character, 0);
    });

    test('move cursor word left within word', () => {
      const motion = new Position(0, 5).getWordLeft();
      assert.strictEqual(motion.line, 0);
      assert.strictEqual(motion.character, 4);
    });

    test('first word should move to previous line, beginning of last word', () => {
      const motion = new Position(1, 2).getWordLeft();
      assert.strictEqual(motion.line, 0);
      assert.strictEqual(motion.character, 10);
    });

    test('first word should move to previous line, stops on empty line', () => {
      const motion = new Position(4, 2).getWordLeft();
      assert.strictEqual(motion.line, 3);
      assert.strictEqual(motion.character, 0);
    });

    test('first word should move to previous line, skips whitespace only line', () => {
      const motion = new Position(6, 0).getWordLeft();
      assert.strictEqual(motion.line, 4);
      assert.strictEqual(motion.character, 14);
    });
  });

  suite('WORD right', () => {
    test('move to WORD right', () => {
      const motion = new Position(0, 3).getBigWordRight();
      assert.strictEqual(motion.line, 0);
      assert.strictEqual(motion.character, 10);
    });

    test('last WORD should move to next line', () => {
      const motion = new Position(1, 10).getBigWordRight();
      assert.strictEqual(motion.line, 2);
      assert.strictEqual(motion.character, 0);
    });

    test('last WORD should move to next line stops on empty line', () => {
      const motion = new Position(2, 7).getBigWordRight();
      assert.strictEqual(motion.line, 3);
      assert.strictEqual(motion.character, 0);
    });

    test('last WORD should move to next line skips whitespace only line', () => {
      const motion = new Position(4, 12).getBigWordRight();
      assert.strictEqual(motion.line, 6);
      assert.strictEqual(motion.character, 0);
    });
  });

  suite('WORD left', () => {
    test('move cursor WORD left across spaces', () => {
      const motion = new Position(0, 3).getBigWordLeft();
      assert.strictEqual(motion.line, 0);
      assert.strictEqual(motion.character, 0);
    });

    test('move cursor WORD left within WORD', () => {
      const motion = new Position(0, 5).getBigWordLeft();
      assert.strictEqual(motion.line, 0);
      assert.strictEqual(motion.character, 3);
    });

    test('first WORD should move to previous line, beginning of last WORD', () => {
      const motion = new Position(2, 0).getBigWordLeft();
      assert.strictEqual(motion.line, 1);
      assert.strictEqual(motion.character, 9);
    });

    test('first WORD should move to previous line, stops on empty line', () => {
      const motion = new Position(4, 2).getBigWordLeft();
      assert.strictEqual(motion.line, 3);
      assert.strictEqual(motion.character, 0);
    });

    test('first WORD should move to previous line, skips whitespace only line', () => {
      const motion = new Position(6, 0).getBigWordLeft();
      assert.strictEqual(motion.line, 4);
      assert.strictEqual(motion.character, 9);
    });
  });

  suite('end of word right', () => {
    test('move to end of current word right', () => {
      const motion = new Position(0, 4).getCurrentWordEnd();
      assert.strictEqual(motion.line, 0);
      assert.strictEqual(motion.character, 7);
    });

    test('move to end of next word right', () => {
      const motion = new Position(0, 7).getCurrentWordEnd();
      assert.strictEqual(motion.line, 0);
      assert.strictEqual(motion.character, 8);
    });

    test('end of last word should move to next line', () => {
      const motion = new Position(0, 10).getCurrentWordEnd();
      assert.strictEqual(motion.line, 1);
      assert.strictEqual(motion.character, 7);
    });

    test('end of last word should move to next line skips empty line', () => {
      const motion = new Position(2, 7).getCurrentWordEnd();
      assert.strictEqual(motion.line, 4);
      assert.strictEqual(motion.character, 7);
    });

    test('end of last word should move to next line skips whitespace only line', () => {
      const motion = new Position(4, 14).getCurrentWordEnd();
      assert.strictEqual(motion.line, 6);
      assert.strictEqual(motion.character, 0);
    });
  });

  suite('end of WORD right', () => {
    test('move to end of current WORD right', () => {
      const motion = new Position(0, 4).getCurrentBigWordEnd();
      assert.strictEqual(motion.line, 0);
      assert.strictEqual(motion.character, 8);
    });

    test('move to end of next WORD right', () => {
      const motion = new Position(0, 8).getCurrentBigWordEnd();
      assert.strictEqual(motion.line, 0);
      assert.strictEqual(motion.character, 10);
    });

    test('end of last WORD should move to next line', () => {
      const motion = new Position(0, 10).getCurrentBigWordEnd();
      assert.strictEqual(motion.line, 1);
      assert.strictEqual(motion.character, 7);
    });

    test('end of last WORD should move to next line skips empty line', () => {
      const motion = new Position(2, 7).getCurrentBigWordEnd();
      assert.strictEqual(motion.line, 4);
      assert.strictEqual(motion.character, 7);
    });

    test('end of last WORD should move to next line skips whitespace only line', () => {
      const motion = new Position(4, 14).getCurrentBigWordEnd();
      assert.strictEqual(motion.line, 6);
      assert.strictEqual(motion.character, 0);
    });
  });

  test('line begin cursor on first non-blank character', () => {
    const motion = TextEditor.getFirstNonWhitespaceCharOnLine(4);
    assert.strictEqual(motion.line, 4);
    assert.strictEqual(motion.character, 2);
  });

  test('last line begin cursor on first non-blank character', () => {
    const motion = TextEditor.getFirstNonWhitespaceCharOnLine(6);
    assert.strictEqual(motion.line, 6);
    assert.strictEqual(motion.character, 0);
  });
});

suite('unicode word motion', () => {
  const text: Array<string> = [
    '漢字ひらがなカタカナalphabets、いろいろな文字。',
    'Καλημέρα κόσμε',
    'Die früh sich einst dem trüben Blick gezeigt.',
    'Được tiếp đãi ân cần',
    '100£and100$and100¥#♯x',
  ];

  suiteSetup(() => {
    return setupWorkspace().then(() => {
      return TextEditor.insert(text.join('\n'));
    });
  });

  suiteTeardown(cleanUpWorkspace);

  suite('word right', () => {
    test('move cursor word right stops at different kind of character (ideograph -> hiragana)', () => {
      const motion = new Position(0, 0).getWordRight();
      assert.strictEqual(motion.line, 0);
      assert.strictEqual(motion.character, 2);
    });

    test('move cursor word right stops at different kind of character (katakana -> ascii)', () => {
      const motion = new Position(0, 7).getWordRight();
      assert.strictEqual(motion.line, 0);
      assert.strictEqual(motion.character, 10);
    });

    test('move cursor word right stops at different kind of chararacter (ascii -> punctuation)', () => {
      const motion = new Position(0, 10).getWordRight();
      assert.strictEqual(motion.line, 0);
      assert.strictEqual(motion.character, 19);
    });

    test('move cursor word right on non-ascii text', () => {
      const motion = new Position(1, 0).getWordRight();
      assert.strictEqual(motion.line, 1);
      assert.strictEqual(motion.character, 9);
    });

    test('move cursor word right recognizes a latin string which has diacritics as a single word', () => {
      const motion = new Position(2, 4).getWordRight();
      assert.strictEqual(motion.line, 2);
      assert.strictEqual(motion.character, 9);
    });

    test('move cursor word right recognizes a latin-1 symbol as punctuation', () => {
      let motion = new Position(4, 3).getWordRight();
      assert.strictEqual(motion.line, 4);
      assert.strictEqual(motion.character, 4);

      motion = motion.getWordRight(); // issue #3680
      assert.strictEqual(motion.line, 4);
      assert.strictEqual(motion.character, 10);
    });

    test('move cursor word right recognizes a sequence of latin-1 symbols and other symbols as a word', () => {
      const motion = new Position(4, 17).getWordRight();
      assert.strictEqual(motion.line, 4);
      assert.strictEqual(motion.character, 20);
    });
  });

  suite('word left', () => {
    test('move cursor word left across the different char kind', () => {
      const motion = new Position(0, 2).getWordLeft();
      assert.strictEqual(motion.line, 0);
      assert.strictEqual(motion.character, 0);
    });

    test('move cursor word left within the same char kind', () => {
      const motion = new Position(0, 5).getWordLeft();
      assert.strictEqual(motion.line, 0);
      assert.strictEqual(motion.character, 2);
    });

    test('move cursor word left across spaces on non-ascii text', () => {
      const motion = new Position(1, 9).getWordLeft();
      assert.strictEqual(motion.line, 1);
      assert.strictEqual(motion.character, 0);
    });

    test('move cursor word left within word on non-ascii text', () => {
      const motion = new Position(1, 11).getWordLeft();
      assert.strictEqual(motion.line, 1);
      assert.strictEqual(motion.character, 9);
    });

    test('move cursor word left recognizes a latin string which has diacritics as a single word', () => {
      const motion = new Position(3, 10).getWordLeft();
      assert.strictEqual(motion.line, 3);
      assert.strictEqual(motion.character, 5);
    });
  });
});

suite('sentence motion', () => {
  const text: Array<string> = [
    'This text has many sections in it. What do you think?',
    '',
    'A paragraph boundary is also a sentence boundry, see',
    '',
    'Weird things happen when there is no appropriate sentence ending',
    '',
    'Next line is just whitespace',
    '   ',
    'Wow!',
    'Another sentence inside one paragraph.',
  ];

  suiteSetup(() => {
    return setupWorkspace().then(() => {
      return TextEditor.insert(text.join('\n'));
    });
  });

  suiteTeardown(cleanUpWorkspace);

  suite('sentence forward', () => {
    test('next concrete sentence', () => {
      const motion = new Position(0, 0).getSentenceBegin({ forward: true });
      assert.strictEqual(motion.line, 0);
      assert.strictEqual(motion.character, 35);
    });

    test('next sentence that ends with paragraph ending', () => {
      const motion = new Position(2, 50).getNextLineBegin();
      assert.strictEqual(motion.line, 3);
      assert.strictEqual(motion.character, 0);
    });

    test('next sentence when cursor is at the end of previous paragraph', () => {
      const motion = new Position(3, 0).getSentenceBegin({ forward: true });
      assert.strictEqual(motion.line, 4);
      assert.strictEqual(motion.character, 0);
    });

    test('next sentence when paragraph contains a line of whilte spaces', () => {
      const motion = new Position(6, 2).getSentenceBegin({ forward: true });
      assert.strictEqual(motion.line, 9);
      assert.strictEqual(motion.character, 0);
    });
  });

  suite('sentence backward', () => {
    test('current sentence begin', () => {
      const motion = new Position(0, 37).getSentenceBegin({ forward: false });
      assert.strictEqual(motion.line, 0);
      assert.strictEqual(motion.character, 35);
    });

    test('sentence forward when cursor is at the beginning of the second sentence', () => {
      const motion = new Position(0, 35).getSentenceBegin({ forward: false });
      assert.strictEqual(motion.line, 0);
      assert.strictEqual(motion.character, 0);
    });

    test('current sentence begin with no concrete sentense inside', () => {
      const motion = new Position(3, 0).getSentenceBegin({ forward: false });
      assert.strictEqual(motion.line, 2);
      assert.strictEqual(motion.character, 0);
    });

    test("current sentence begin when it's not the same as current paragraph begin", () => {
      const motion = new Position(2, 0).getSentenceBegin({ forward: false });
      assert.strictEqual(motion.line, 1);
      assert.strictEqual(motion.character, 0);
    });

    test('current sentence begin when previous line ends with a concrete sentence', () => {
      const motion = new Position(9, 5).getSentenceBegin({ forward: false });
      assert.strictEqual(motion.line, 9);
      assert.strictEqual(motion.character, 0);
    });
  });
});

suite('paragraph motion', () => {
  const text: Array<string> = [
    'this text has', // 0
    '', // 1
    'many', // 2
    'paragraphs', // 3
    '', // 4
    '', // 5
    'in it.', // 6
    '', // 7
    'WOW', // 8
  ];

  suiteSetup(() => {
    return setupWorkspace().then(() => {
      return TextEditor.insert(text.join('\n'));
    });
  });

  suiteTeardown(cleanUpWorkspace);

  suite('paragraph down', () => {
    test('move down normally', () => {
      const motion = new Position(0, 0).getCurrentParagraphEnd();
      assert.strictEqual(motion.line, 1);
      assert.strictEqual(motion.character, 0);
    });

    test('move down longer paragraph', () => {
      const motion = new Position(2, 0).getCurrentParagraphEnd();
      assert.strictEqual(motion.line, 4);
      assert.strictEqual(motion.character, 0);
    });

    test('move down starting inside empty line', () => {
      const motion = new Position(4, 0).getCurrentParagraphEnd();
      assert.strictEqual(motion.line, 7);
      assert.strictEqual(motion.character, 0);
    });

    test('paragraph at end of document', () => {
      const motion = new Position(7, 0).getCurrentParagraphEnd();
      assert.strictEqual(motion.line, 8);
      assert.strictEqual(motion.character, 3);
    });
  });

  suite('paragraph up', () => {
    test('move up short paragraph', () => {
      const motion = new Position(1, 0).getCurrentParagraphBeginning();
      assert.strictEqual(motion.line, 0);
      assert.strictEqual(motion.character, 0);
    });

    test('move up longer paragraph', () => {
      const motion = new Position(3, 0).getCurrentParagraphBeginning();
      assert.strictEqual(motion.line, 1);
      assert.strictEqual(motion.character, 0);
    });

    test('move up starting inside empty line', () => {
      const motion = new Position(5, 0).getCurrentParagraphBeginning();
      assert.strictEqual(motion.line, 1);
      assert.strictEqual(motion.character, 0);
    });
  });
});
