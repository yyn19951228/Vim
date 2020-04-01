import * as vscode from 'vscode';
import { IConfiguration, IKeyRemapping } from '../iconfiguration';
import { Notation } from '../notation';
import { IConfigurationValidator, ValidatorResults } from '../iconfigurationValidator';

export class RemappingValidator implements IConfigurationValidator {
  private _commandMap: Map<string, boolean>;

  async validate(config: IConfiguration): Promise<ValidatorResults> {
    const result = new ValidatorResults();
    const modeKeyBindingsKeys = [
      'insertModeKeyBindings',
      'insertModeKeyBindingsNonRecursive',
      'normalModeKeyBindings',
      'normalModeKeyBindingsNonRecursive',
      'visualModeKeyBindings',
      'visualModeKeyBindingsNonRecursive',
      'commandLineModeKeyBindings',
      'commandLineModeKeyBindingsNonRecursive',
    ];
    for (const modeKeyBindingsKey of modeKeyBindingsKeys) {
      let keybindings = config[modeKeyBindingsKey];

      const modeKeyBindingsMap = new Map<string, IKeyRemapping>();
      for (let i = keybindings.length - 1; i >= 0; i--) {
        let remapping = keybindings[i] as IKeyRemapping;

        // validate
        let remappingError = await this.isRemappingValid(remapping);
        result.concat(remappingError);
        if (remappingError.hasError) {
          // errors with remapping, skip
          keybindings.splice(i, 1);
          continue;
        }

        // normalize
        if (remapping.before) {
          remapping.before.forEach(
            (key, idx) => (remapping.before[idx] = Notation.NormalizeKey(key, config.leader))
          );
        }

        if (remapping.after) {
          remapping.after.forEach(
            (key, idx) => (remapping.after![idx] = Notation.NormalizeKey(key, config.leader))
          );
        }

        // check for duplicates
        const beforeKeys = remapping.before.join('');
        if (modeKeyBindingsMap.has(beforeKeys)) {
          result.append({
            level: 'warning',
            message: `${remapping.before}. Duplicate remapped key for ${beforeKeys}.`,
          });
          continue;
        }

        // add to map
        modeKeyBindingsMap.set(beforeKeys, remapping);
      }

      config[modeKeyBindingsKey + 'Map'] = modeKeyBindingsMap;
    }

    return result;
  }

  disable(config: IConfiguration) {
    // no-op
  }

  private async isRemappingValid(remapping: IKeyRemapping): Promise<ValidatorResults> {
    const result = new ValidatorResults();

    if (!remapping.after && !remapping.commands) {
      result.append({
        level: 'error',
        message: `${remapping.before} missing 'after' key or 'command'.`,
      });
    }

    if (!(remapping.before instanceof Array)) {
      result.append({
        level: 'error',
        message: `Remapping of '${remapping.before}' should be a string array.`,
      });
    }

    if (remapping.after && !(remapping.after instanceof Array)) {
      result.append({
        level: 'error',
        message: `Remapping of '${remapping.after}' should be a string array.`,
      });
    }

    if (remapping.commands) {
      for (const command of remapping.commands) {
        let cmd: string;

        if (typeof command === 'string') {
          cmd = command;
        } else {
          cmd = command.command;
        }

        if (!(await this.isCommandValid(cmd))) {
          result.append({ level: 'warning', message: `${cmd} does not exist.` });
        }
      }
    }

    return result;
  }

  private async isCommandValid(command: string): Promise<boolean> {
    if (command.startsWith(':')) {
      return true;
    }

    return (await this.getCommandMap()).has(command);
  }

  private async getCommandMap(): Promise<Map<string, boolean>> {
    if (this._commandMap == null) {
      this._commandMap = new Map(
        (await vscode.commands.getCommands(true)).map((x) => [x, true] as [string, boolean])
      );
    }
    return this._commandMap;
  }
}
