import { CellComponentProps } from "cdm/ComponentsModel";
import React, { useEffect, useRef } from "react";
import { useState } from "react";
import EditorCell from "components/cellTypes/EditorCell";
import { TableColumn } from "cdm/FolderModel";
import { c, getAlignmentClassname } from "helpers/StylesHelper";
import { ParseService } from "services/ParseService";
import { InputType, SUGGESTER_REGEX } from "helpers/Constants";
import { MarkdownService } from "services/MarkdownRenderService";

const TextCell = (props: CellComponentProps) => {
  const { defaultCell } = props;
  const { column, table, row } = defaultCell;
  const { tableState } = table.options.meta;
  const tableColumn = column.columnDef as TableColumn;
  const textRow = tableState.data((state) => state.rows[row.index]);

  const configInfo = tableState.configState((state) => state.info);

  const columnsInfo = tableState.columns((state) => state.info);

  const dataActions = tableState.data((state) => state.actions);

  const textCell = tableState.data(
    (state) =>
      ParseService.parseRowToCell(
        state.rows[row.index],
        tableColumn,
        InputType.TEXT,
        configInfo.getLocalSettings()
      ) as string
  );

  /** Ref to cell container */
  const containerCellRef = useRef<HTMLDivElement>();
  const [dirtyCell, setDirtyCell] = useState(false);

  /**
   * Render markdown content of Obsidian on load
   */
  useEffect(() => {
    if (dirtyCell || (!containerCellRef.current && !textCell)) {
      // End useEffect
      return;
    }

    MarkdownService.renderMarkdown(
      defaultCell,
      textCell,
      containerCellRef.current,
      5,
      true
    );
  }, [dirtyCell, textCell]);

  const handleEditableOnclick = () => {
    setDirtyCell(true);
  };

  const persistChange = async (changedValue: string) => {
    changedValue = changedValue.trim();
    if (changedValue !== undefined && changedValue !== textCell) {
      const newCell = ParseService.parseRowToLiteral(
        textRow,
        tableColumn,
        changedValue
      );

      await dataActions.updateCell({
        rowIndex: row.index,
        column: tableColumn,
        value: newCell,
        columns: columnsInfo.getAllColumns(),
        ddbbConfig: configInfo.getLocalSettings(),
      });
    }
    setDirtyCell(false);
  };

  return dirtyCell ? (
    <EditorCell
      defaultCell={defaultCell}
      persistChange={persistChange}
      textCell={textCell}
    />
  ) : (
    <span
      ref={containerCellRef}
      onDoubleClick={handleEditableOnclick}
      // On enter key press
      onKeyDown={(e) => {
        if (SUGGESTER_REGEX.CELL_VALID_KEYDOWN.test(e.key)) {
          handleEditableOnclick();
        } else if (e.key === "Enter") {
          e.preventDefault();
          handleEditableOnclick();
        }
      }}
      style={{ width: column.getSize() }}
      className={c(
        getAlignmentClassname(
          tableColumn.config,
          configInfo.getLocalSettings(),
          ["tabIndex"]
        )
      )}
      tabIndex={0}
    />
  );
};

export default TextCell;
