import * as assert from 'assert';

// You can import and use all API from the 'vscode' module
// as well as import your extension to test it
import * as vscode from 'vscode';

import { AlertMessageForConflicts, Conflict } from '../../conflicts';

suite('Extension Test Suite', () => {
    vscode.window.showInformationMessage('Start all tests.');

    test('Sample test', () => {
        assert.strictEqual(-1, [1, 2, 3].indexOf(5));
        assert.strictEqual(-1, [1, 2, 3].indexOf(0));
    });

    test('conflict messages', async () => {
        let conflicts: Array<Conflict> = [
            {
                commit: "7f4ecbdceeb365f61384c30c4f13e05b8da0f50d",
                commit_message: "This is a commit message, actually.\nAnd here it is on the next line.",
                conflicting_files: ["a.txt", "foo.txt"],
                is_conflicting_working_directory: false,
                counterpart: "master",
            }
        ];

        let res = AlertMessageForConflicts([{
            repoOwner: "sturdy-dev",
            repoName: "sturdy-vscode",
            conflicts: {
                conflicts: conflicts,
            }
        }]);

        assert.strictEqual(res.message, "You have conflicts:\nthe changes to a.txt, foo.txt in 7f4ecbdc [\"This is a commit message, actually.\"] are conflicting with master.\n");
    });

    test('conflict messages working directory', async () => {
        let conflicts: Array<Conflict> = [
            {
                commit: "",
                commit_message: "",
                conflicting_files: ["a.txt", "foo.txt"],
                is_conflicting_working_directory: true,
                counterpart: "master",
            }
        ];

        let res = AlertMessageForConflicts([{
            repoOwner: "sturdy-dev",
            repoName: "sturdy-vscode",
            conflicts: {
                conflicts: conflicts,
            }
        }]);

        assert.strictEqual(res.message, "You have conflicts:\nyour uncommited changes to a.txt, foo.txt are conflicting with master.\n");
    });
});
