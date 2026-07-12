# Build the white paper. Requires a TeX distribution (latexmk + pdflatex).
# Regenerate data/ first with:  npm run evaluate   (from the repo root)

main.pdf: main.tex references.bib data/config.tex
	latexmk -pdf -interaction=nonstopmode main.tex

.PHONY: clean
clean:
	latexmk -C
	rm -f main.bbl main.run.xml
