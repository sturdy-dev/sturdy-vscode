import * as assert from 'assert';

// You can import and use all API from the 'vscode' module
// as well as import your extension to test it
import * as vscode from 'vscode';

import { AlertMessageForConflicts, Conflict, StatusBarMessageForConflicts } from '../../conflicts';

suite('Extension Test Suite', () => {
    vscode.window.showInformationMessage('Start all tests.');

    test('Sample test', () => {
        assert.strictEqual(-1, [1, 2, 3].indexOf(5));
        assert.strictEqual(-1, [1, 2, 3].indexOf(0));
    });

    test('conflict messages', async () => {
        let conflicts: Array<Conflict> = [
             {
                id: "abc123",
                repository_id: "abc123",
                base: "111111",
                onto: "222222",
                onto_name: "master",
                onto_reference_type: "",
                onto_reference_id: "",
                conflicting: true,
                is_conflict_in_working_directory: false,
                checked_at: "2021-02-02",
                user_id: "abc123",
                conflicting_files: ["a.txt", "foo.txt"],
             },

              // Another one with no conflict
              {
                id: "abc123",
                repository_id: "abc123",
                base: "111111",
                onto: "444444",
                onto_name: "not-master",
                onto_reference_type: "",
                onto_reference_id: "",
                conflicting: false,
                is_conflict_in_working_directory: false,
                checked_at: "2021-02-02",
                user_id: "abc123",
                conflicting_files: [],
             }
        ];

        let c = [{
            repoOwner: "sturdy-dev",
            repoName: "sturdy-vscode",
            conflicts: {
                conflicts: conflicts,
            }
        }];

        let alert = AlertMessageForConflicts(c)
        assert.strictEqual(alert.anyConflicts, true)
        assert.strictEqual(alert.message, "Your commited changes are conflicting with master. ");

        let statusBar = StatusBarMessageForConflicts(c)
        assert.strictEqual(statusBar.msg, "$(error) master")
    });

    test('conflict messages working directory', async () => {
        let conflicts: Array<Conflict> = [
            {
                id: "abc123",
                repository_id: "abc123",
                base: "111111",
                onto: "222222",
                onto_name: "master",
                onto_reference_type: "",
                onto_reference_id: "",
                conflicting: true,
                is_conflict_in_working_directory: true,
                checked_at: "2021-02-02",
                user_id: "abc123",
                conflicting_files: ["a.txt", "foo.txt"],
             },

             // Conflict with PR
             {
                id: "abc123",
                repository_id: "abc123",
                base: "111111",
                onto: "222222",
                onto_name: "github-pr-123",
                onto_reference_type: "github-pr",
                onto_reference_id: "123",
                conflicting: true,
                is_conflict_in_working_directory: true,
                checked_at: "2021-02-02",
                user_id: "abc123",
                conflicting_files: ["a.txt", "foo.txt"],
             },

             // Another one with no conflict
             {
                id: "abc123",
                repository_id: "abc123",
                base: "111111",
                onto: "444444",
                onto_name: "not-master",
                onto_reference_type: "",
                onto_reference_id: "",
                conflicting: false,
                is_conflict_in_working_directory: false,
                checked_at: "2021-02-02",
                user_id: "abc123",
                conflicting_files: [],
             }
        ];

        let c = [{
            repoOwner: "sturdy-dev",
            repoName: "sturdy-vscode",
            conflicts: {
                conflicts: conflicts,
            }
        }];

        let alert = AlertMessageForConflicts(c)
        assert.strictEqual(alert.anyConflicts, true)
        assert.strictEqual(alert.message, "Your uncommitted changes are conflicting with master, #123. ");

        let statusBar = StatusBarMessageForConflicts(c)
        assert.strictEqual(statusBar.msg, "$(error) master and $(warning) 1 PR")
    });

    test('conflict messages no conflicts', async () => {
        let conflicts: Array<Conflict> = [
            {
                id: "abc123",
                repository_id: "abc123",
                base: "111111",
                onto: "222222",
                onto_name: "master",
                onto_reference_type: "",
                onto_reference_id: "",
                conflicting: false,
                is_conflict_in_working_directory: false,
                checked_at: "2021-02-02",
                user_id: "abc123",
                conflicting_files: [],
             }
        ];

        let c = [{
            repoOwner: "sturdy-dev",
            repoName: "sturdy-vscode",
            conflicts: {
                conflicts: conflicts,
            }
        }];

        let alert = AlertMessageForConflicts(c)
        assert.strictEqual(alert.anyConflicts, false)

        let statusBar = StatusBarMessageForConflicts(c)
        assert.strictEqual(statusBar.msg, "$(check) No conflicts")
    });
});
