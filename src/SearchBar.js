import { Autocomplete, TextField } from "@mui/material";
import { useEffect, useState } from "react";

function SearchBar({ fileManager, files = true, directories = true, rows,
     advanced = true, search = true, placeholder = "Search", onSelect, onEnter, onOptionsChanged, onChange }) {

    const [baseOptions, setBaseOptions] = useState(new Set());
    const [options, setOptions] = useState([]);
    const [byExtension, setByExtension] = useState({});


    useEffect(() => {
        if (!fileManager) {
            setOptions([]);
            setBaseOptions(new Set());
            setByExtension({});
            return;
        }

        const allOptions = [];
        const byExt = {};

        const queue = [""];
        while (queue.length > 0) {
            const current = queue.pop();
            const children = fileManager.getChildren(typeof current === 'string' ? current : (current.path || ""));
            Object.values(children).forEach(f => {
                if (f.type === "directory") {
                    queue.push(f);
                    if (directories) {
                        allOptions.push(f.path);
                    }
                } else if (f.type === "file") {
                    if (files) {
                        allOptions.push(f.path);
                    }
                    if (advanced) {
                        const parts = f.name.split(".");
                        const extension = parts.length > 1 ? parts.pop().toLowerCase() : "";
                        if (extension) {
                            if (!byExt[extension]) {
                                byExt[extension] = [];
                            }
                            byExt[extension].push(f.path);
                        }
                    }
                }
            });
        }
        setOptions(allOptions);
        setBaseOptions(new Set(allOptions));
        setByExtension(byExt);

    }, [fileManager, rows, files, directories, advanced]);


    const setAutoCompleteOptions = (event, value) => {
        const input = value || "";
        let newOptions = [];
        const parts = input.split(" ").filter(Boolean);
        const advancedParts = [];
        const textParts = [];
        parts.forEach(part => {
            if (part.startsWith("ext:")) {
                advancedParts.push(part);
            } else {
                textParts.push(part);
            }
        });

        let advancedOptions = null;
        advancedParts.forEach(part => {
            if (advanced) {
                const type = part.split(":")[1]?.toLowerCase();
                if (type && byExtension[type]) {
                    if (advancedOptions === null) {
                        advancedOptions = new Set(byExtension[type]);
                    } else {
                        advancedOptions = new Set([...advancedOptions].filter((p) => byExtension[type].includes(p)));
                    }
                }
            }
        });

        const candidateOptions = advancedOptions === null ? [...baseOptions] : [...advancedOptions];
        if (textParts.length === 0) {
            newOptions = candidateOptions;
        } else {
            for (let option of candidateOptions) {
                const lower = option.toLowerCase();
                if (textParts.every(part => lower.includes(part.toLowerCase()))) {
                    newOptions.push(option);
                }
            }
        }
        if (input && baseOptions.has(input)) {
            newOptions.unshift(input);
        }
        newOptions = [...new Set(newOptions)];
        setOptions(newOptions);
        if (onOptionsChanged) {
            onOptionsChanged(newOptions);
        }
    }
        


    return <Autocomplete
        freeSolo={search}
        clearIcon={null}
        renderInput={(params) => (
            <TextField
                {...params}
                label={placeholder}
                InputProps={{
                    ...params.InputProps,
                    type: 'search',
                }}
            />
        )}
        filterOptions={(x) => x}
        onInputChange={function (event, value) {
            setAutoCompleteOptions(event, value);
            if (onChange) { onChange(value); }
        }}
        onChange={function (event, value) {
            setAutoCompleteOptions(event, value);
            if (onChange) { onChange(value); }
            if (onSelect) { onSelect(value); }
        }}
        onKeyDown={(event) => {
            if (event.key === "Enter" && onEnter) {
                onEnter();
            }
        }}
        options={options}
    />
}

export default SearchBar;