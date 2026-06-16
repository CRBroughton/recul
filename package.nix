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
    makeWrapper
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
    runHook preInstall
    mkdir -p $out/lib/recul $out/bin
    cp -r dist node_modules package.json $out/lib/recul/
    find $out -xtype l -delete
    makeWrapper ${pkgs.nodejs}/bin/node $out/bin/recul \
      --add-flags "$out/lib/recul/dist/bin/recul.js"
    runHook postInstall
  '';

  meta = {
    description = "Stay N versions behind the latest npm dependencies to avoid supply chain attacks";
    homepage = "https://github.com/CRBroughton/recul";
    license = lib.licenses.mit;
    mainProgram = "recul";
  };
})