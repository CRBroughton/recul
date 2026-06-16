{
  description = "Recul - stay N versions behind the latest npm dependencies";

  inputs.nixpkgs.url = "github:NixOS/nixpkgs/nixos-unstable";

  outputs = { nixpkgs, ... }:
    let
      systems = [ "x86_64-linux" "aarch64-darwin" ];
      forEachSystem = f: nixpkgs.lib.genAttrs systems (system: f {
        pkgs = import nixpkgs { inherit system; };
      });
    in
    {
      packages = forEachSystem ({ pkgs }: {
        default = pkgs.callPackage ./package.nix { inherit pkgs; lib = pkgs.lib; };
      });
    };
}
