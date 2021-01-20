# Sturdy

Sturdy is a code collaboration tool that makes working together simpler. Get notified in **real-time** about potential merge conflicts with with other developers.

It works by first connecting with a GitHub repo. Then Sturdy proactively searching for merge issues between your local work and the (local) work of others. Because all the heavy work is done in the cloud, the extension does not slow down VSCode.

## Features

Detects merge conflicts in **real-time**. Sturdy proactively searches for merge issues between your local work and the local work of other developers on your project.

### Conflicts with the remote **default** branch

When another developer on your team push changes to the default branch, Sturdy checks for conflicts with your local (unpushed) work and informs you of conflicts as soon as they occur.

![Conflict notification](https://getsturdy.com/img/head-conflicts.gif)

### Conflicts of your **uncommitted** changes

Sturdy notifies you of merge conflicts as soon as you type the code, **before** you have even committed anything! By giving you an early heads-up you can make an informed decision and consider pulling the latest code first.

![Uncommited conflicts](https://getsturdy.com/img/uncommitted.gif)

### Shows you **exactly** where the potential issue is

Overview of conflicts presented in the web.
![Details](https://getsturdy.com/img/conflict-demo.gif)

### Integrates with GitHub

Sturdy seamlessly integrates with GitHub and your existing workflow.

### Conflicts with unmerged **PRs**

Coming soon

### Conflicts with **local** branches of other developers

Coming soon

## Setup

1. Install this extension to VSCode
2. Sign up at https://getsturdy.com/
3. Choose a repository that you wish to configure
4. Open the Command Pallette (Shift + ⌘ + P) and type "Sturdy Auth"
5. In the popup, enter the token that you see in https://getsturdy.com/install/token

## Known Issues

TBD

## Release Notes

### 0.1.0

Initial release

<p align="center">
  <a title="Learn more about Sturdy Code Collab" href="https://getsturdy.com"><img src="https://getsturdy.com/img/sturdy_logo_transparent_small.png" alt="Sturdy code collab logo" /></a>
</p>
