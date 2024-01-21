import * as React from "react";
import {
  useReactTable,
  getCoreRowModel,
  getFilteredRowModel,
  getExpandedRowModel,
  getPaginationRowModel,
  ColumnDef,
  ColumnOrderState,
  Table,
  Header,
  HeaderGroup,
  Row,
  getSortedRowModel,
  ColumnSizingState,
  getFacetedRowModel,
  getFacetedMinMaxValues,
  getFacetedUniqueValues,
} from "@tanstack/react-table";
import { TableDataType, RowDataType, TableColumn } from "cdm/FolderModel";
import StateManager from "StateManager";
import {
  DatabaseLimits,
  EMITTERS_GROUPS,
  EMITTERS_SHORTCUT,
  MetadataColumns,
  ResizeConfiguration,
} from "helpers/Constants";
import DefaultCell from "components/DefaultCell";
import DefaultHeader from "components/DefaultHeader";
import { c } from "helpers/StylesHelper";
import { HeaderNavBar } from "components/NavBar";
import TableHeader from "components/TableHeader";
import TableRow from "components/TableRow";
import TableFooter from "components/TableFooter";
import DefaultFooter from "components/DefaultFooter";
import getInitialColumnSizing from "components/behavior/InitialColumnSizeRecord";
import customSortingfns, {
  globalDatabaseFilterFn,
} from "components/reducers/TableFilterFlavours";
import dbfolderColumnSortingFn from "components/reducers/CustomSortingFn";
import { useState } from "react";
import {
  obsidianMdLinksOnClickCallback,
  obsidianMdLinksOnMouseOverMenuCallback,
} from "components/obsidianArq/markdownLinks";
import HeaderContextMenuWrapper from "components/contextMenu/HeaderContextMenuWrapper";
import TableActions from "components/tableActions/TableActions";
import PaginationTable from "components/navbar/PaginationTable";
import onKeyDownArrowKeys from "./behavior/ArrowKeysNavigation";

const defaultColumn: Partial<ColumnDef<RowDataType>> = {
  minSize: DatabaseLimits.MIN_COLUMN_WIDTH,
  size: DatabaseLimits.DEFAULT_COLUMN_WIDTH,
  cell: DefaultCell,
  header: DefaultHeader,
  enableResizing: true,
  footer: DefaultFooter,
};

/**
 * Table component based on react-table
 * @param tableDataType
 * @returns
 */
export function Table(tableData: TableDataType) {
  /** Main information about the table */
  const { view, tableStore } = tableData;
  const columns = tableStore.columns((state) => state.columns);
  const columnActions = tableStore.columns((state) => state.actions);
  const columnsInfo = tableStore.columns((state) => state.info);
  const rows = tableStore.data((state) => state.rows);
  const rowsActions = tableStore.data((state) => state.actions);

  const cell_size_config = tableStore.configState(
    (store) => store.ddbbConfig.cell_size
  );
  const sticky_first_column_config = tableStore.configState(
    (store) => store.ddbbConfig.sticky_first_column
  );

  const globalConfig = tableStore.configState((store) => store.global);
  const configInfo = tableStore.configState((store) => store.info);
  /** Plugin services */
  const stateManager: StateManager = tableData.stateManager;
  const filePath = stateManager.file.path;

  /** Table services */
  // Actions

  // Sorting
  const [sortBy, sortActions] = tableStore.sorting((store) => [
    store.sortBy,
    store.actions,
  ]);
  // Visibility
  const [columnVisibility, setColumnVisibility] = useState(
    columnsInfo.getVisibilityRecord()
  );
  // Filtering
  const [globalFilter, setGlobalFilter] = useState("");
  // Resizing
  const [columnSizing, setColumnSizing] = useState(
    getInitialColumnSizing(columns)
  );
  const [persistSizingTimeout, setPersistSizingTimeout] = useState(null);
  // Drag and drop
  const [columnOrder, setColumnOrder] = useState<ColumnOrderState>(
    columnsInfo.getValueOfAllColumnsAsociatedWith("id")
  );

  const reorderColumn = (
    draggedColumnId: string,
    targetColumnId: string,
    columnOrder: string[]
  ): ColumnOrderState => {
    columnOrder.splice(
      columnOrder.indexOf(targetColumnId),
      0,
      columnOrder.splice(columnOrder.indexOf(draggedColumnId), 1)[0] as string
    );
    return [...columnOrder];
  };
  // Niveling number of columns
  if (columnOrder.length !== columns.length) {
    setColumnOrder(columnsInfo.getValueOfAllColumnsAsociatedWith("id"));
  }

  const table: Table<RowDataType> = useReactTable({
    columns: columns.map(column => {
      if (!column.nestedKey) {
        return column;
      } else {
        const newColumn = Object.assign({}, column);
        newColumn.accessorKey = `${newColumn.accessorKey}.${newColumn.nestedKey}`;
        return newColumn;
      }
    }),
    data: rows,
    enableExpanding: true,
    getRowCanExpand: () => true,
    columnResizeMode: ResizeConfiguration.RESIZE_MODE,
    state: {
      globalFilter: globalFilter,
      columnOrder: columnOrder,
      columnSizing: columnSizing,
      sorting: sortBy,
      columnVisibility: columnVisibility,
    },
    onColumnVisibilityChange: setColumnVisibility,
    onSortingChange: sortActions.alterSorting,
    onColumnSizingChange: (updater) => {
      const { isResizingColumn, deltaOffset, columnSizingStart } =
        table.options.state.columnSizingInfo;
      let list: ColumnSizingState = null;
      if (typeof updater === "function") {
        list = updater(columnSizing);
      } else {
        list = updater;
      }

      const columnToUpdate = columnSizingStart.find(
        (c) => c[0] === isResizingColumn
      );

      list[columnToUpdate[0]] = columnToUpdate[1] + deltaOffset;

      // cancelling previous timeout
      if (persistSizingTimeout) {
        clearTimeout(persistSizingTimeout);
      }
      // setting new timeout
      setPersistSizingTimeout(
        setTimeout(() => {
          columnActions.alterColumnSize(
            columnToUpdate[0],
            columnToUpdate[1] + deltaOffset
          );
          // timeout until event is triggered after user has stopped typing
        }, 1500)
      );

      setColumnSizing(list);
    },
    onColumnOrderChange: setColumnOrder,
    // Hack to force react-table to use all columns when filtering
    getColumnCanGlobalFilter: () => true,
    globalFilterFn: globalDatabaseFilterFn(configInfo.getLocalSettings()),
    filterFns: customSortingfns,
    meta: {
      tableState: tableStore,
      view: view,
    },
    defaultColumn: {
      ...defaultColumn,
      sortingFn: dbfolderColumnSortingFn(configInfo.getLocalSettings()),
    },
    getExpandedRowModel: getExpandedRowModel(),
    getCoreRowModel: getCoreRowModel(),
    getSortedRowModel: getSortedRowModel(),
    getFilteredRowModel: getFilteredRowModel(),
    getPaginationRowModel: getPaginationRowModel(),
    getFacetedRowModel: getFacetedRowModel(),
    getFacetedUniqueValues: getFacetedUniqueValues(),
    getFacetedMinMaxValues: getFacetedMinMaxValues(),
    debugAll:
      globalConfig.enable_debug_mode &&
      globalConfig.logger_level_info === "trace",
    autoResetPageIndex: false,
  });

  React.useEffect(() => {
    rowsActions.insertRows();
  }, []);

  return (
    <>
      <HeaderNavBar
        key={`div-header-navbar`}
        table={table}
        globalFilterRows={{
          globalFilter: globalFilter,
          setGlobalFilter: setGlobalFilter,
        }}
      />
      {/* INIT SCROLL PANE */}
      <div className={c("scroll-container scroll-horizontal")}>
        {/* INIT TABLE */}
        <div
          key={`div-table`}
          className={`${c(
            "table noselect cell_size_" +
              cell_size_config +
              (sticky_first_column_config ? " sticky_first_column" : "")
          )}`}
          /** Obsidian event to show page preview */
          onMouseOver={obsidianMdLinksOnMouseOverMenuCallback(view)}
          /** Obsidian to open an internal link in a new pane */
          onMouseDown={obsidianMdLinksOnClickCallback(stateManager, view, filePath)}
          onKeyDown={onKeyDownArrowKeys}
          style={{
            width: table.getCenterTotalSize(),
          }}
        >
          <div key={`div-thead-sticky`} className={c(`thead sticky-top`)}>
            {/* INIT HEADERS */}
            {table
              .getHeaderGroups()
              .map(
                (
                  headerGroup: HeaderGroup<RowDataType>,
                  headerGroupIndex: number
                ) => {
                  const headerContext = headerGroup.headers.find(
                    (h) => h.id === MetadataColumns.ROW_CONTEXT_MENU
                  );
                  const addColumnHeader = headerGroup.headers.find(
                    (h) => h.id === MetadataColumns.ADD_COLUMN
                  );
                  return (
                    <div
                      key={`header-group-${headerGroup.id}-${headerGroupIndex}`}
                      className={`${c("tr header-group")}`}
                    >
                      {/** HEADER CONTEXT */}
                      <HeaderContextMenuWrapper
                        header={headerContext}
                        style={{
                          width: "30px",
                        }}
                      />
                      {/** LIST OF COLUMNS */}
                      {headerGroup.headers
                        .filter(
                          (h) =>
                            ![headerContext.id, addColumnHeader.id].includes(
                              h.id
                            )
                        )
                        .map(
                          (
                            header: Header<RowDataType, TableColumn>,
                            headerIndex: number
                          ) => (
                            <TableHeader
                              key={`${header.id}-${headerIndex}`}
                              table={table}
                              header={header}
                              reorderColumn={reorderColumn}
                              headerIndex={headerIndex + 1}
                            />
                          )
                        )}
                      {/** ADD COLUMN HEADER */}
                      <HeaderContextMenuWrapper
                        header={addColumnHeader}
                        style={{
                          width: "45px",
                        }}
                      />
                    </div>
                  );
                }
              )}
            {/* ENDS HEADERS */}
          </div>
          {/* INIT BODY */}
          <div key={`div-tbody`} className={c(`tbody`)}>
            {table.getRowModel().rows.map((row: Row<RowDataType>) => (
              <TableRow
                key={`table-cell-${row.index}`}
                row={row}
                table={table}
              />
            ))}
            {/* ENDS BODY */}
          </div>
          {/* INIT FOOTER */}
          <div key={`div-tfoot`} className={c(`tfoot`)}>
            <div className={c(`tr footer-group`)}>
              <div
                className={c(`td footer`)}
                key={`footer-add-row-button`}
                onClick={(e) => {
                  e.preventDefault();
                  view.emitter.emit(
                    EMITTERS_GROUPS.SHORTCUT,
                    EMITTERS_SHORTCUT.ADD_NEW_ROW
                  );
                }}
              >
                +
              </div>
              {Array.from(
                Array(table.getFooterGroups()[0].headers.length - 1)
              ).map((_, index) => (
                <div
                  className={c(`td`)}
                  key={`footer-add-row-mock-td-${index}`}
                />
              ))}
            </div>
            {configInfo.getLocalSettings().enable_footer
              ? table
                  .getFooterGroups()
                  .map((footerGroup: HeaderGroup<RowDataType>) => {
                    return (
                      <div
                        key={`footer-group-${footerGroup.id}`}
                        className={`${c("tr footer-group")}`}
                      >
                        {footerGroup.headers.map(
                          (header: Header<RowDataType, TableColumn>) => (
                            <TableFooter
                              key={`table-footer-${header.index}`}
                              table={table}
                              header={header}
                            />
                          )
                        )}
                      </div>
                    );
                  })
              : null}
            {/* ENDS FOOTER */}
          </div>
          {/* ENDS TABLE */}
        </div>
        {/* ENDS SCROLL PANE */}
      </div>
      {/* INIT PAGINATION */}
      <PaginationTable table={table} />
      {/* ENDS PAGINATION */}
      {/* INIT DEBUG INFO */}
      {globalConfig.enable_show_state && (
        <pre>
          <code>{JSON.stringify(table.getState(), null, 2)}</code>
        </pre>
      )}
      {/* ENDS DEBUG INFO */}
      {/* INIT TABLE ACTIONS */}
      <TableActions table={table} />
      {/* ENDS TABLE ACTIONS */}
    </>
  );
}
