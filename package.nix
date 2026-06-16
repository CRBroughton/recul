{ pkgs, lib }:

pkgs.stdenv.mkDerivation (finalAttrs: {
  pname = "recul";
  version = "0.6.2";

  src = pkgs.fetchFromGitHub {
    owner = "CRBroughton";
    repo = finalAttrs.pname;
    rev = "v${finalAttrs.version}";
    hash = "sha256-hgmAMuezQmYAnfrrN8vyoF91fWFxi9/3qxZeOeQeaXg=";
  };

  nativeBuildInputs = with pkgs; [
    nodejs
    pnpm
    pnpmConfigHook
  ];

  pnpmDeps = pkgs.fetchPnpmDeps {
    inherit (finalAttrs) pname version src;
    fetcherVersion = 3;
    hash = "sha256-Z/WL1KVuUc3BLp8iG0SvbmyY8ZrqRH02PHImJFWHwvM=";
  };

  buildPhase = ''
    pnpm build
  '';

  installPhase = ''
    mkdir -p $out/bin
    cp -r dist $out/
    echo '#!/usr/bin/env node' > $out/bin/recul
    echo "require('$out/dist/bin/recul.js')" >> $out/bin/recul
    chmod +x $out/bin/recul
  '';

  meta = {
    description = "Stay N versions behind the latest npm dependencies to avoid supply chain attacks";
    homepage = "https://github.com/CRBroughton/recul";
    license = lib.licenses.mit;
    mainProgram = "recul";
  };
})