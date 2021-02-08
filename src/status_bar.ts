import * as vscode from "vscode";

let sturdyStatusBarItem: vscode.StatusBarItem;
let sturdyStatusBarLastMessage: StatusBarMessage | undefined;
let statusBarCommandID = "sturdy.statusBarCommand";
let ctx: vscode.ExtensionContext;

export function initStatusBar(context: vscode.ExtensionContext) {
  ctx = context;
    // Open repo on the web
    let sturdyStatusBarCommand = vscode.commands.registerCommand(statusBarCommandID, () => {
      if (!sturdyStatusBarLastMessage) {
        return;
      }

      let uri = "https://getsturdy.com/repo/" + sturdyStatusBarLastMessage.repoOwner + "/" + sturdyStatusBarLastMessage.repoName;
      vscode.env.openExternal(vscode.Uri.parse(uri));
    });

  sturdyStatusBarItem = vscode.window.createStatusBarItem(vscode.StatusBarAlignment.Left, 100);
  sturdyStatusBarItem.command = statusBarCommandID;
  context.subscriptions.push(sturdyStatusBarItem);
  sturdyStatusBarItem.hide();
}

export interface StatusBarMessage {
    msg: string;
    backgroundColor: vscode.ThemeColor | undefined;
    
    repoOwner: string;
    repoName: string;
}

export function setStatusBarText(m: StatusBarMessage) {
    // There is a bug and you can't unset the background color of a status item.
    // If we want to do it, dispose the previous status bar item, and create a new one.
    // https://github.com/microsoft/vscode/issues/115886
    if (sturdyStatusBarItem.backgroundColor !== undefined && m.backgroundColor === undefined) {
      sturdyStatusBarItem.hide()
      sturdyStatusBarItem.dispose()

      // Create a new item
      sturdyStatusBarItem = vscode.window.createStatusBarItem(vscode.StatusBarAlignment.Left, 100);
      sturdyStatusBarItem.command = statusBarCommandID;
      ctx.subscriptions.push(sturdyStatusBarItem);
    }

    sturdyStatusBarItem.text = m.msg;
    sturdyStatusBarItem.backgroundColor = m.backgroundColor;
    sturdyStatusBarItem.show();

    // Save the message, so that we know what to do when it's clicked.
    sturdyStatusBarLastMessage = m;
}
