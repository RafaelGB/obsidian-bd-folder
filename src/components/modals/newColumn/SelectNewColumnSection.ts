import { AddColumnModalHandlerResponse } from "cdm/ModalsModel";
import { AbstractChain } from "patterns/AbstractFactoryChain";
import { AbstractHandler } from "patterns/AbstractHandler";
import { AddEmptyColumnHandler } from "components/modals/newColumn/handlers/AddEmptyColumnHandler";
import { AddExistingColumnHandler } from "components/modals/newColumn/handlers/AddExistingColumnHandler";

class SelectNewColumnSection extends AbstractChain<AddColumnModalHandlerResponse> {
    protected getHandlers(): AbstractHandler<AddColumnModalHandlerResponse>[] {
        return [
            new AddEmptyColumnHandler(),
            new AddExistingColumnHandler()
        ];
    }
}

export const select_new_column_section = new SelectNewColumnSection();