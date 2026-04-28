OPENCODE_VERSION="$(bun -e 'console.log((await Bun.file("packages/opencode/package.json").json()).version)')-manual-apply" ./packages/opencode/script/build.ts --single
./install --binary ./packages/opencode/dist/opencode-linux-x64/bin/opencode
opencode --version
