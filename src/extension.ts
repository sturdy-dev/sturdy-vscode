// The module 'vscode' contains the VS Code extensibility API
// Import the module and reference it with the alias vscode in your code below
import * as vscode from "vscode";
import simpleGit, {
  SimpleGit,
  SimpleGitOptions,
  TaskOptions,
} from "simple-git";
import { format } from "path";

// this method is called when your extension is activated
// your extension is activated the very first time the command is executed
export function activate(context: vscode.ExtensionContext) {
  // Use the console to output diagnostic information (console.log) and errors (console.error)
  // This line of code will only be executed once when your extension is activated
  console.log('Congratulations, your extension "sturdy" is now active!');

  // The command has been defined in the package.json file
  // Now provide the implementation of the command with registerCommand
  // The commandId parameter must match the command field in package.json
  let disposable = vscode.commands.registerCommand("sturdy.helloWorld", () => {
    // The code you place here will be executed every time your command is executed

    work();
    // Display a message box to the user
    vscode.window.showInformationMessage("Hello Sturdy again!");
  });

  context.subscriptions.push(disposable);
}

async function work() {
  let remote = "~/tmp/mockremote";
  let userID = "foobarsson";
  for (;;) {
    foo(remote, userID);
    console.log("here");
    await new Promise((resolve) => setTimeout(resolve, 1000));
  }
}

function foo(remote: string, userID: string) {
  const options: SimpleGitOptions = {
    baseDir: process.cwd(),
    binary: "git",
    maxConcurrentProcesses: 6,
  };
  const git: SimpleGit = simpleGit(options);
  git.addRemote("check-conflicts", remote);
  git.branch().then((br: any) => {
    let currentBranch = br.current;
    git.push("check-conflicts", currentBranch + ":" + userID, ["--force"]);
  });
}

// this method is called when your extension is deactivated
export function deactivate() {}
