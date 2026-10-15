Find the JAN code (the EAN-13 / JAN barcode number printed on the retail package, usually 13 digits starting with 45 or 49) for each Japanese retail product listed in the input file. It is for a shop's barcode scanner: a wrong code is worse than no code, so accuracy matters more than coverage.

Input: read the JSON array in INPUT_FILE (productId, Vietnamese name, Japanese name nameJa, the shop's Amazon link costUrl if any — that link is sometimes WRONG, so trust nameJa first and only use the link as a hint).

How to work:
- Use WebSearch (mode "standard"; "extended" only if standard finds nothing useful) and WebFetch. Good queries: `<nameJa> JAN`, `<nameJa> JANコード`, the brand's official product page, Japanese drugstore / retailer listings (kenko.com, matsukiyococokara-online, sundrug-online, tsuruha, create-sd, Yodobashi, Bic Camera, LOHACO, Rakuten, Yahoo Shopping, cosme) which usually show "JANコード" in the spec table or in the URL. Amazon pages rarely show JAN.
- The JAN must be for the EXACT item: same brand, same line, same variant (colour/type/scent) and same size/count (14g vs 24g, 60粒 vs 120粒 differ). A set/bundle (2個セット) code is not the single item's code. If nameJa is too vague (no brand), return null.
- Verify the GS1 check digit (13 digits: weights 1,3,1,3… from the left over the first 12; check = (10 − sum mod 10) mod 10). Never invent or "fix" digits; never report a code you could not see on a page for that item.
- Confidence: "high" = official/manufacturer page, OR two independent retailer pages agree for the exact item; "medium" = one reputable retailer/JAN-database page for the exact item; "low" = uncertain match (variant/size unclear). Nothing reliable → code null, confidence "none".
- At most ~6 searches/fetches per product. If the shop's Amazon link clearly points to a different product, say so in the note ("wrong link: …").

Output: WRITE a JSON array to OUTPUT_FILE (use the Write tool), one object per input product in the same order:
{"productId": number, "code": "4901234567894" | null, "confidence": "high"|"medium"|"low"|"none", "matchedTitle": "title on the evidence page", "evidence": ["url1","url2"], "note": "short reason, esp. size/variant check", "altCodes": [{"code": "…", "note": "older package / renewal of the SAME item and size, seen on a page"}]}
altCodes: only other codes of the very same item and size (old or new packaging) that you actually saw; [] if none. Not other sizes, not sets.
Then reply with one line: "done N products, K codes".
