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

  work();
  // The command has been defined in the package.json file
  // Now provide the implementation of the command with registerCommand
  // The commandId parameter must match the command field in package.json
  let disposable = vscode.commands.registerCommand("sturdy.helloWorld", () => {
    // The code you place here will be executed every time your command is executed

    // Display a message box to the user
    vscode.window.showInformationMessage("Hello Sturdy again!");
  });
  let onStart = vscode.commands.registerCommand("onStartupFinished", () =>
    work()
  );

  context.subscriptions.push(disposable, onStart);
}

async function work() {
  const conf: any = vscode.workspace.getConfiguration().get("conf.sturdy");
  let git = init();
  var head = "";
  for (;;) {
    let currHead = await git.revparse("HEAD");
    if (head !== currHead) {
      push(git, conf.remote, conf.userId);
      head = currHead;
    }
    await new Promise((resolve) => setTimeout(resolve, 3000));
  }
}

function init(): SimpleGit {
  const options: SimpleGitOptions = {
    baseDir: process.cwd(),
    binary: "git",
    maxConcurrentProcesses: 6,
  };
  return simpleGit(options);
}

function push(git: SimpleGit, remote: string, userID: string) {
  git.addRemote("check-conflicts", remote);
  git.branch().then((br: any) => {
    let currentBranch = br.current;
    git.push("check-conflicts", currentBranch + ":" + userID, ["--force"]);
  });
}

// this method is called when your extension is deactivated
export function deactivate() {}
